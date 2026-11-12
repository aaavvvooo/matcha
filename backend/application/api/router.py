from fastapi import APIRouter
from .endpoints.auth import router as auth_router
from .endpoints.oauth import router as oauth_router
from .endpoints.profile import router as profile_router
from .endpoints.photos import router as photo_router
from .endpoints.users import router as users_router
from .endpoints.chat import router as chat_router
from .endpoints.discovery import router as discovery_router
from .endpoints.notifications import router as notifications_router
from .endpoints.dates import router as dates_router


router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
router.include_router(oauth_router, prefix="/auth/oauth", tags=["Authentication"])
router.include_router(profile_router, prefix="/profile", tags=["Profile"])
router.include_router(photo_router, prefix="/profile", tags=["Profile"])
router.include_router(users_router, prefix="/users", tags=["Users"])
router.include_router(discovery_router, prefix="/profiles", tags=["Discovery"])
router.include_router(notifications_router, prefix="/notifications", tags=["Notifications"])
router.include_router(chat_router, prefix="/chat", tags=["Chat"])
router.include_router(dates_router, prefix="/dates", tags=["Dates"])
