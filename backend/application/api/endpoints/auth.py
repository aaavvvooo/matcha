from fastapi import APIRouter, Depends, HTTPException, Response, Request
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
from application.tasks.email_tasks import send_verification_email_task
from application.utils import get_current_user
from application.limiter import limiter


router = APIRouter()


@router.post("/register", response_model=RegisterUserResponse)
@limiter.limit("10/hour")
async def register(
    request: Request, body: RegisterRequest, db: Database = Depends(get_db)
):
    service = AuthService(db)
    user, token = await service.register(body)
    send_verification_email_task.delay(
        to=user.email, username=user.username, token=token
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
    request: Request, body: ForgetPasswordRequest, db=Depends(get_db)
):
    service = AuthService(db)
    result = await service.forget_password(body.username_or_email)
    return result


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
