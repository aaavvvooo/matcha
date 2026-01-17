from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from application.schema import RegisterRequest, VerificationToken
from application.database import get_db
from application.service import AuthService
from application.tasks.email_tasks import send_verification_email_task
from application.utils import get_current_user, create_access_token, verify_password
from application.repository.user_repo import UserRepository



router = APIRouter()

@router.post("/register")
async def register(
    request: RegisterRequest,
    db = Depends(get_db)
):
    try:
        service = AuthService(db)
        user, token = await service.register(request)
        send_verification_email_task.delay(
            email=user.email,
            username=user.username,
            token=token.token
        )
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

    return user

@router.post("/verify-email")
async def verify(
    request: VerificationToken,
    db = Depends(get_db),
):
    service = AuthService(db)
    user = await service.verify_email(request.token)
    return user

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db = Depends(get_db)
):
    repo = UserRepository(db)
    user = await repo.get_user_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    access_token = create_access_token(data={"sub": user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
async def read_current_user(current_user: dict = Depends(get_current_user)):
    return {"user": current_user["username"]}