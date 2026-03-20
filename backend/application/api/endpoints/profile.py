from fastapi import APIRouter, Depends, HTTPException, Response, Request

from application.schema.profile_schemas import (
    SetProfileRequest,
    ProfileRequest,
    ProfileResponse
)

from application.database import get_db, Database
from application.service import ProfileService
from application.utils import get_current_user
from application.limiter import limiter


router = APIRouter(dependencies=[Depends(get_current_user)],)


@router.post("/set")
@limiter.limit("10/hour")
async def set(
    request: Request, body: SetProfileRequest, db: Database = Depends(get_db)
):
    service = ProfileService(db)
    profile = await service.set_profile(body)
    return profile


@router.get("/get", response_model=ProfileResponse)
@limiter.limit("30/minute")
async def get(request: Request, body: ProfileRequest, db: Database = Depends(get_db)):
    return


@router.patch("/update")
@limiter.limit("10/minute")
async def update(request: Request, db: Database = Depends(get_db)):
    return


@router.post("/set-profpic")
@limiter.limit("10/minute")
async def set_profpic(request: Request, db: Database = Depends(get_db)):
    return


@router.post("/add-photos")
@limiter.limit("20/minute")
async def add_photos(request: Request, db: Database = Depends(get_db)):
    return


@router.delete("/delete-photos")
@limiter.limit("20/minute")
async def delete_photos(request: Request, db: Database = Depends(get_db)):
    return


@router.post("/add-tags")
@limiter.limit("20/minute")
async def add_tags(request: Request, db: Database = Depends(get_db)):
    return


@router.delete("/delete-tags")
@limiter.limit("20/minute")
async def delete_tags(request: Request, db: Database = Depends(get_db)):
    return