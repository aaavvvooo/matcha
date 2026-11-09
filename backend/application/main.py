from .database import database
from .config import FRONTEND_URL
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging

import asyncpg
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from application.api.router import router
from application.limiter import limiter
from application.repository.token_repo import TokenRepository
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
        await repo.cleanup_expired_tokens()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect()
    from application.clients.storage import ensure_bucket
    try:
        await asyncio.to_thread(ensure_bucket)
    except Exception:
        # Unreachable storage must not stop the app from listening -- that
        # turns a broken photo feature into a container that never starts.
        logger.exception("Photo storage unavailable; photo routes will fail")
    await database.execute(
        "UPDATE users SET is_online = false WHERE is_online = true"
    )
    cleanup_task = asyncio.create_task(_token_cleanup_loop())

    yield

    cleanup_task.cancel()
    await database.disconnect()


app = FastAPI(title="Matcha", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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
    """Public liveness check: reports only whether the database answers."""
    if not database.pool:
        raise HTTPException(status_code=503, detail="Database pool not initialized")
    try:
        result = await database.fetch_val("SELECT 1")
        return {"status": "healthy", "database": {"connected": result == 1}}
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
