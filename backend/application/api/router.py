from fastapi import APIRouter
from .endpoints.auth import router as auth_router
from .endpoints.profile import router as profile_router


router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
router.include_router(profile_router, prefix="/profile", tags=["Profile"])
