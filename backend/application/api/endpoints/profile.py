from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from typing import List

from application.schema.profile_schemas import (
    SetProfileRequest,
    UpdateProfileRequest,
    SetProfilePicRequest,
    DeletePhotosRequest,
    ProfileResponse,
    PhotoResponse,
    TagResponse,
)
from application.database import get_db, Database
from application.service import ProfileService
from application.repository.profile_repo import ProfileRepository
from application.utils import get_current_user
from application.limiter import limiter


router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/set")
@limiter.limit("10/hour")
async def set(
    request: Request,
    body: SetProfileRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    body.user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.set_profile(body)


@router.get("/get", response_model=ProfileResponse)
@limiter.limit("30/minute")
async def get(
    request: Request, user_id: int, db: Database = Depends(get_db)
):
    service = ProfileService(db)
    return await service.get_profile(user_id)


@router.patch("/update", response_model=ProfileResponse)
@limiter.limit("10/minute")
async def update(
    request: Request,
    body: UpdateProfileRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.update_profile(user_id, body)


@router.post("/set-profpic", response_model=PhotoResponse)
@limiter.limit("10/minute")
async def set_profpic(
    request: Request,
    body: SetProfilePicRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.set_profile_picture(user_id, body.photo_id)


@router.post("/upload-photo", response_model=list[PhotoResponse])
@limiter.limit("20/minute")
async def upload_photo(
    request: Request,
    files: List[UploadFile] = File(...),
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from application.clients.minio_client import upload_photo as minio_upload
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    current_count = await service.profile_repo.count_photos(user_id)
    if current_count + len(files) > 5:
        raise HTTPException(status_code=400, detail=f"Cannot exceed 5 photos total")
    urls = []
    for file in files:
        if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
            raise HTTPException(status_code=400, detail=f"{file.filename}: only JPEG, PNG and WebP are allowed")
        data = await file.read()
        if len(data) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{file.filename}: file size must not exceed 5 MB")
        urls.append(minio_upload(data, file.content_type))
    return await service.add_photos(user_id, urls)



@router.delete("/delete-photos", response_model=list[int])
@limiter.limit("20/minute")
async def delete_photos(
    request: Request,
    body: DeletePhotosRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.delete_photos(user_id, body.photo_ids)


@router.get("/get-all-tags", response_model=list[TagResponse])
@limiter.limit("30/minute")
async def get_tags(request: Request, db: Database = Depends(get_db)):
    repo = ProfileRepository(db)
    rows = await repo.get_all_tags()
    return [TagResponse(**dict(row)) for row in rows]

