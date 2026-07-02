from fastapi import APIRouter
from .endpoints.auth import router as auth_router
from .endpoints.profile import router as profile_router
from .endpoints.users import router as users_router
from .endpoints.chat import router as chat_router


router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
router.include_router(profile_router, prefix="/profile", tags=["Profile"])
router.include_router(users_router, prefix="/users", tags=["Users"])
router.include_router(chat_router, prefix="/chat", tags=["Chat"])
