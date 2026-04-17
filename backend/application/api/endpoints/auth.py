import asyncio
import logging
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
from application.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()

_email_client: EmailClient | None = None


def _get_email_client() -> EmailClient:
    global _email_client
    if _email_client is None:
        if not BREVO_API_KEY:
            raise RuntimeError("BREVO_API_KEY is not configured")
        _email_client = EmailClient(api_key=BREVO_API_KEY)
    return _email_client


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
            if attempt < max_retries - 1:
                await asyncio.sleep(delay)
            else:
                logger.error("Email delivery failed after %d attempts: %s", max_retries, e)


@router.post("/register", response_model=RegisterUserResponse)
@limiter.limit("10/hour")
async def register(
    request: Request,
    body: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: Database = Depends(get_db),
):
    service = AuthService(db)
    user, token = await service.register(body)
    background_tasks.add_task(
        _send_with_retry,
        _get_email_client().send_verification_email,
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
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.get("/me")
async def current_user(current_user: dict = Depends(get_current_user)):
    return {"user": current_user["user"]["username"]}


@router.post("/forget-password")
@limiter.limit("3/minute")
async def forget_password(
    request: Request,
    body: ForgetPasswordRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
):
    service = AuthService(db)
    result = await service.forget_password(body.username_or_email)
    if result.has_email:
        background_tasks.add_task(
            _send_with_retry,
            _get_email_client().send_password_reset_email,
            result.email_to,
            result.email_username,
            result.email_token,
        )
    return {"message": result.message}


@router.post("/logout")
async def logout(
    response: Response,
    db: Database = Depends(get_db),
    current_user=Depends(get_current_user),
):
    auth_service = AuthService(db)
    try:
        await auth_service.logout(current_user["token"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token")
    response.delete_cookie("refresh_token")
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
