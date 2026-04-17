from fastapi import APIRouter
from .endpoints.auth import router as auth_router
from .endpoints.photos import router as photos_router
from .endpoints.tags import router as tags_router


router = APIRouter()

router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
router.include_router(photos_router, prefix="/photos", tags=["Photos"])
router.include_router(tags_router, prefix="/tags", tags=["Tags"])
