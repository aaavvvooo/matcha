from fastapi import APIRouter, Depends
from application.schema import RegisterRequest
from application.database import get_db
from application.service.auth_service import AuthService
from application.tasks.email_tasks import send_verification_email_task

router = APIRouter()

@router.post("/register")
async def register(
    request: RegisterRequest,
    db = Depends(get_db)
):
    service = AuthService(db)
    user, token = await service.register(request)

    send_verification_email_task.delay(
        email=user.email,
        username=user.username,
        token=token.token
    )

    return user