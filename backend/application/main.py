from .database import database
from .config import FRONTEND_URL
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging
import re

import asyncpg
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from application.api.router import router
from application.limiter import limiter
from application.repository.token_repo import TokenRepository
from application.repository.user_repo import UserRepository
from application.service.date_service import DateService
from application.service.profile_service import MAX_PHOTOS
from application.utils.image import MAX_IMAGE_BYTES
from application.utils.tokens import decode_token, parse_session_claims
from application.websocket.call_manager import call_manager
from typing import Any, cast

# Application loggers have no handler under uvicorn's default config, so
# INFO/WARNING from application.* would be dropped. Give the root one.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# httpx logs every request URL at INFO; geocoding URLs carry the user's city
# or exact coordinates.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


_OAUTH_CALLBACK_RE = re.compile(r"^(?P<path>[^?]*/auth/oauth/[^/?]+/callback)\?")


class _RedactOAuthCallbackQuery(logging.Filter):
    """Drop the query string (authorization code + state) from uvicorn access-log
    lines for the OAuth callbacks; every other request is logged unchanged.

    uvicorn logs `'%s - "%s %s HTTP/%s" %d'` with args
    (client_addr, method, path_with_query, http_version, status).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            match = _OAUTH_CALLBACK_RE.match(args[2])
            if match:
                record.args = (*args[:2], f"{match['path']}?[redacted]", *args[3:])
        return True


def _install_access_log_redaction() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, _RedactOAuthCallbackQuery) for f in access_logger.filters):
        access_logger.addFilter(_RedactOAuthCallbackQuery())


# uvicorn configures logging before importing the app, so the filter survives;
# lifespan installs it again in case logging was reconfigured later.
_install_access_log_redaction()


def _db_error_in_chain(exc: BaseException) -> BaseException | None:
    """Return the first asyncpg error in exc's cause/context chain, if any."""
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, (asyncpg.PostgresError, asyncpg.InterfaceError)):
            return cur
        cur = cur.__cause__ or cur.__context__
    return None

_CLEANUP_INTERVAL_SECONDS = 3600  # run every hour


async def _token_cleanup_loop() -> None:
    repo = TokenRepository(database)
    while True:
        await asyncio.sleep(_CLEANUP_INTERVAL_SECONDS)
        try:
            await repo.cleanup_expired_tokens()
        except Exception as e:
            # One failed run (e.g. DB restart) must not kill the loop for good.
            logger.error(
                "Token cleanup failed: %s sqlstate=%s",
                type(e).__name__, getattr(e, "sqlstate", None),
            )


_REMINDER_INTERVAL_SECONDS = 60  # check for upcoming dates every minute


async def _date_reminder_loop() -> None:
    service = DateService(database)
    while True:
        try:
            await service.send_due_reminders()
        except Exception as e:
            # One failed run (e.g. DB restart) must not kill the loop for good.
            logger.error(
                "Date reminders failed: %s sqlstate=%s",
                type(e).__name__, getattr(e, "sqlstate", None),
            )
        await asyncio.sleep(_REMINDER_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _install_access_log_redaction()
    from application.clients.storage import check_config, ensure_bucket
    check_config()  # misconfiguration (e.g. MinIO credentials unset) stops startup with a clear error
    await database.connect()
    try:
        await asyncio.to_thread(ensure_bucket)
    except Exception:
        # Unreachable storage must not stop the app from listening -- that
        # turns a broken photo feature into a container that never starts.
        logger.exception("Photo storage unavailable; photo routes will fail")
    await UserRepository(database).reset_online_flags()
    cleanup_task = asyncio.create_task(_token_cleanup_loop())
    reminder_task = asyncio.create_task(_date_reminder_loop())

    yield

    background_tasks = (cleanup_task, reminder_task)
    for task in background_tasks:
        task.cancel()
    # Let them unwind before the pool goes away (a loop mid-query would hit a closed pool).
    await asyncio.gather(*background_tasks, return_exceptions=True)
    call_manager.shutdown()
    await database.disconnect()


app = FastAPI(title="Matcha", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """422 with location + message only. The default body echoes the rejected input, which can
    carry text the JSON encoder cannot serialise (a lone surrogate would turn into a 500)."""
    errors = [
        {"loc": list(e.get("loc", ())), "msg": str(e.get("msg", "Invalid value")), "type": str(e.get("type", ""))}
        for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


# Starlette parses the whole multipart body before the endpoint (or any
# dependency) runs, so oversized uploads must be refused here, from the header.
_UPLOAD_PATH = "/profile/upload-photo"
_MAX_UPLOAD_BODY = MAX_PHOTOS * MAX_IMAGE_BYTES + 64 * 1024  # files + multipart overhead
# Every other route takes small JSON / form bodies.
_MAX_BODY = 64 * 1024
_BODY_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _has_live_access_token(request: Request) -> bool:
    """Signature, type and expiry of the Bearer / cookie access token, without touching the DB
    (the endpoint's dependency does the full check after the body is parsed)."""
    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth[:7].lower() == "bearer " else request.cookies.get("access_token")
    if not token or len(token) > 4096:
        return False
    payload = decode_token(token)
    return bool(payload) and payload.get("type") == "access" and parse_session_claims(payload) is not None


@app.middleware("http")
async def body_size_guard(request: Request, call_next):
    if request.method in _BODY_METHODS:
        # Chunked bodies have no declared size, and h11 lets Transfer-Encoding
        # override a (small) Content-Length: refuse it so the length below is
        # the real body size, enforced by the server's HTTP framing.
        if "transfer-encoding" in request.headers:
            return JSONResponse(status_code=411, content={"detail": "Content-Length required"})
        is_upload = request.method == "POST" and request.url.path == _UPLOAD_PATH
        length = request.headers.get("content-length")
        if is_upload:
            # Credentials are fully verified only after the body is parsed; make sure a
            # forged or expired token can't trigger that 25 MB parse.
            if not _has_live_access_token(request):
                return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
            if length is None or not (length.isascii() and length.isdigit()):
                return JSONResponse(status_code=411, content={"detail": "Content-Length required"})
            if int(length) > _MAX_UPLOAD_BODY:
                return JSONResponse(status_code=413, content={"detail": "Upload too large"})
        elif length is not None:
            if not (length.isascii() and length.isdigit()):
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
            if int(length) > _MAX_BODY:
                return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


# Registered before CORSMiddleware so CORS wraps it: the browser receives a readable
# JSON 500 instead of an opaque CORS failure, and no exception text ever leaves the server.
@app.middleware("http")
async def unhandled_error_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        db_err = _db_error_in_chain(exc)
        if db_err is not None:
            # asyncpg messages echo row data ("Key (email)=(...) already exists",
            # "invalid input for query argument $2: '<value>'"): log metadata only.
            logger.error(
                "DB error on %s %r: %s sqlstate=%s constraint=%s",
                request.method, request.url.path, type(db_err).__name__,
                getattr(db_err, "sqlstate", None), getattr(db_err, "constraint_name", None),
            )
        else:
            logger.exception("Unhandled error on %s %r", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Defence in depth for every API response (JSON, photos, errors). CORP is same-site so the SPA
# (http://localhost:3000 and :8000 are one site) can still show photos with <img>.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
}


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response


app.add_middleware(
    cast(Any, CORSMiddleware),
    allow_origins=["http://localhost:3000", FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)


@app.get("/")
async def read_root():
    return {
        "message": "FastAPI Backend Connected to PostgreSQL",
        "database": "Connected",
    }


@app.get("/health")
async def health_check():
    """Public liveness check: database reachable, storage bucket ready (no details)."""
    if not database.pool:
        raise HTTPException(status_code=503, detail="Database pool not initialized")
    try:
        result = await database.fetch_val("SELECT 1")
        from application.clients.storage import is_ready

        storage_ready = is_ready()
        return {
            "status": "healthy" if storage_ready else "degraded",
            "database": {"connected": result == 1},
            "storage": {"ready": storage_ready},
        }
    except Exception:
        logger.exception("Health check failed")
        raise HTTPException(
            status_code=503,
            detail={"status": "unhealthy", "database": {"connected": False}},
        )


@app.get("/health/simple")
async def health_check_simple():
    """
    Simple health check - just ping database
    Useful for load balancers
    """
    try:
        await database.fetch_val("SELECT 1")
        return {"status": "ok"}
    except Exception:
        raise HTTPException(status_code=503, detail={"status": "error"})
