from fastapi import APIRouter, Depends
from application.schema import RegisterRequest
from application.database import get_db
from application.service.auth_service import AuthService

router = APIRouter()

@router.post("/register")
def register(
    request: RegisterRequest,
    db = Depends(get_db)
):
    service = AuthService(db)
    user = service.register(request)
    return user