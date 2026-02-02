from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from application.schema import RegisterRequest, VerificationToken, ForgetPasswordRequest, TokenResponse, UserLogin, RegisterUserResponse
from application.database import get_db, Database
from application.service import AuthService
from application.tasks.email_tasks import send_verification_email_task
from application.utils import get_current_user
from application.repository.user_repo import UserRepository
from pprint import pprint



router = APIRouter()

@router.post("/register", response_model=RegisterUserResponse)
async def register(request: RegisterRequest,db: Database = Depends(get_db)):
    try:
        service = AuthService(db)
        user, token = await service.register(request)

        send_verification_email_task.delay(
            to=user.email,
            username=user.username,
            token=token.token
        )

        return user
    except Exception as e:
        raise 


@router.post("/verify-email", response_model=RegisterUserResponse)
async def verify(request: VerificationToken,db = Depends(get_db)):
    service = AuthService(db)
    user = await service.verify_email(request.token)
    return user

@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    service = AuthService(db)
    access_token = await service.login(form_data.username, form_data.password)
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
async def current_user(current_user: dict = Depends(get_current_user)):
    pprint(current_user)
    return {"user": current_user["user"]["username"]}

# @router.post("/forget-password")
# async def forget_password(request: ForgetPasswordRequest, db = Depends(get_db)):
#     service = AuthService(db)
#     user = await service.forget_password(request.username_or_email)
#     return user

# @router.post("/login", response_model=TokenResponse)
# async def login(payload: UserLogin, db: Database = Depends(get_db)):
#     auth_service = AuthService(session)
#     try:
#         tokens = await auth_service.login(username=payload.email, password=payload.password)
#     except InvalidCredentials:
#         raise HTTPException(status_code=400, detail="Invalid credentials")
#     return TokenResponse(access_token=tokens)


@router.post("/logout")
async def logout(db: Database = Depends(get_db), current_user = Depends(get_current_user)):
    auth_service = AuthService(db)
    try:
        await auth_service.logout(current_user["token"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token")
    return {"message": "Successfully logged out"}


# @router.post("/reset-password")
# async def reset_password(