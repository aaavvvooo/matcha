from fastapi import APIRouter, Depends, UploadFile, File
from application.database import get_db, Database
from application.service.photo_service import PhotoService
from application.schema.photo_schemas import PhotoResponse
from application.utils import get_current_user
from typing import List

router = APIRouter()


@router.get("", response_model=List[PhotoResponse])
async def get_my_photos(
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from application.repository.photo_repo import PhotoRepository
    repo = PhotoRepository(db)
    return await repo.get_photos(current_user["user"]["id"])


@router.post("", response_model=PhotoResponse, status_code=201)
async def upload_photo(
    file: UploadFile = File(...),
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = PhotoService(db)
    return await service.upload_photo(current_user["user"]["id"], file)


@router.delete("/{photo_id}", status_code=204)
async def delete_photo(
    photo_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = PhotoService(db)
    await service.delete_photo(current_user["user"]["id"], photo_id)


@router.patch("/{photo_id}/set-profile", status_code=204)
async def set_profile_picture(
    photo_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = PhotoService(db)
    await service.set_profile_picture(current_user["user"]["id"], photo_id)
