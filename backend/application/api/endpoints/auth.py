import asyncio
import json
import logging
import re
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, Request
from fastapi.security import OAuth2PasswordRequestForm

from application.schema import (
    RegisterRequest,
    VerificationToken,
    ForgetPasswordRequest,
    TokenResponse,
    RegisterUserResponse,
    ResetPasswordRequest,
)
from application.database import get_db, Database
from application.service import AuthService
from application.clients.email_client import EmailClient
from application.config import BREVO_API_KEY
from application.utils import get_current_user
from application.utils.tokens import ACCESS_TOKEN_EXPIRE_MINUTES
from application.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()

_email_client: EmailClient | None = None


def _get_email_client() -> EmailClient:
    global _email_client
    if _email_client is None:
        if not BREVO_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="Email service is not configured",
            )
        _email_client = EmailClient(api_key=BREVO_API_KEY)
    return _email_client


def _describe_email_error(e: Exception) -> str:
    """Safe one-line summary of a delivery failure for the logs.

    Brevo's ApiException carries the HTTP status and a JSON body whose `code`
    (e.g. "unauthorized") tells an unlisted IP apart from a bad key. The body's
    `message` and the exception text are never logged: they can echo the request
    payload (recipient address, token link).
    """
    status = getattr(e, "status", None)
    code = None
    body = getattr(e, "body", None)
    if body:
        try:
            parsed = json.loads(body)
        except (TypeError, ValueError):
            parsed = None
        if isinstance(parsed, dict) and isinstance(parsed.get("code"), str):
            code = re.sub(r"[^A-Za-z0-9_.-]", "", parsed["code"])[:64] or None
    return f"{type(e).__name__} status={status} code={code}"


async def _send_with_retry(fn, *args, max_retries: int = 3, delay: float = 10.0):
    # NOTE: email delivery via BackgroundTasks is best-effort — jobs are lost
    # on process restart. Acceptable for this project; upgrade to a persistent
    # queue if stronger delivery guarantees are needed.
    loop = asyncio.get_running_loop()
    for attempt in range(max_retries):
        try:
            await loop.run_in_executor(None, fn, *args)
            return
        except Exception as e:
            status = getattr(e, "status", None)
            # 4xx other than 429 (bad key, IP not allowlisted, bad payload)
            # won't succeed on retry.
            permanent = isinstance(status, int) and 400 <= status < 500 and status != 429
            if permanent:
                logger.error("Email delivery rejected, not retrying: %s", _describe_email_error(e))
                return
            if attempt < max_retries - 1:
                logger.warning(
                    "Email delivery attempt %d/%d failed: %s",
                    attempt + 1, max_retries, _describe_email_error(e),
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    "Email delivery failed after %d attempts: %s",
                    max_retries, _describe_email_error(e),
                )


@router.post("/register", response_model=RegisterUserResponse)
@limiter.limit("10/hour")
async def register(
    request: Request,
    body: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: Database = Depends(get_db),
):
    # Resolve the email client first: a 503 must not leave an account behind
    # that can never receive its verification link.
    email_client = _get_email_client()
    service = AuthService(db)
    user, token = await service.register(body)
    background_tasks.add_task(
        _send_with_retry,
        email_client.send_verification_email,
        user.email,
        user.username,
        token,
    )
    return user


@router.post("/verify-email", response_model=RegisterUserResponse)
@limiter.limit("10/minute")
async def verify(request: Request, body: VerificationToken, db=Depends(get_db)):
    service = AuthService(db)
    user = await service.verify_email(body.token)
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db=Depends(get_db),
):
    service = AuthService(db)
    access_token, refresh_token = await service.login(
        form_data.username, form_data.password
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="strict",
        max_age=7 * 24 * 60 * 60,
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.get("/me")
async def current_user(
    response: Response,
    current_user: dict = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    from application.repository.profile_repo import ProfileRepository
    response.headers["Cache-Control"] = "no-store"
    user = dict(current_user["user"])
    profile_repo = ProfileRepository(db)
    profile = await profile_repo.get_profile(user["id"])
    user["has_profile"] = profile is not None and profile.get("gender") is not None
    return user


@router.post("/forget-password")
@limiter.limit("3/minute")
async def forget_password(
    request: Request,
    body: ForgetPasswordRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
):
    email_client = _get_email_client()  # 503 before a reset token is stored
    service = AuthService(db)
    result = await service.forget_password(body.username_or_email)
    if result.has_email:
        background_tasks.add_task(
            _send_with_retry,
            email_client.send_password_reset_email,
            result.email_to,
            result.email_username,
            result.email_token,
        )
    return {"message": result.message}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: Database = Depends(get_db),
):
    # Deliberately no auth dependency: an expired access token must still be able to
    # log out, otherwise the 7-day refresh cookie survives and the session comes back.
    auth_header = request.headers.get("Authorization", "")
    access_token = auth_header[7:] if auth_header.lower().startswith("bearer ") else None
    try:
        await AuthService(db).logout(access_token, request.cookies.get("refresh_token"))
    except Exception:
        # Server-side revocation failed; still end the browser session below.
        logger.exception("Logout: token revocation failed")
    response.delete_cookie("refresh_token", httponly=True, samesite="strict")
    response.delete_cookie("access_token", httponly=True, samesite="strict")
    return {"message": "Successfully logged out"}


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh(request: Request, response: Response, db=Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    service = AuthService(db)
    access_token, new_refresh_token = await service.refresh(refresh_token)
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=False,
        samesite="strict",
        max_age=7 * 24 * 60 * 60,
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    request: Request, body: ResetPasswordRequest, db: Database = Depends(get_db)
):
    service = AuthService(db)
    await service.reset_password(body.token, body.password)
