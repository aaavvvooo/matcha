from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from typing import List

from application.schema.profile_schemas import (
    SetProfileRequest,
    UpdateProfileRequest,
    SetLocationRequest,
    SetProfilePicRequest,
    DeletePhotosRequest,
    ProfileResponse,
    PhotoResponse,
    TagResponse,
    LocationResponse,
)
from application.database import get_db, Database
from application.service import ProfileService
from application.service.profile_service import MAX_PHOTOS
from application.repository.profile_repo import ProfileRepository
from application.utils import get_current_user
from application.utils.image import MAX_IMAGE_BYTES, detect_image_type
from application.limiter import limiter


router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/set", response_model=ProfileResponse)
@limiter.limit("10/hour")
async def set(
    request: Request,
    body: SetProfileRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    body.user_id = user_id
    service = ProfileService(db)
    await service.set_profile(body)
    return await service.get_profile(user_id)


@router.get("/get", response_model=ProfileResponse)
@limiter.limit("30/minute")
async def get(
    request: Request,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
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


@router.patch("/location", response_model=LocationResponse)
@limiter.limit("10/minute")
async def set_location(
    request: Request,
    body: SetLocationRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.set_location(user_id, body)


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
    from application.clients.storage import upload_photo as storage_upload
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    current_count = await service.profile_repo.count_photos(user_id)
    # Checked before storing anything so a rejected request leaves no orphaned objects.
    if current_count + len(files) > MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Cannot exceed {MAX_PHOTOS} photos")
    # Validate every file before storing any, so a bad file never leaves orphans in storage.
    validated: list[tuple[bytes, str]] = []
    for file in files:
        data = await file.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail=f"{file.filename}: file size must not exceed 5 MB")
        image_type = detect_image_type(data)
        if image_type is None:
            raise HTTPException(status_code=400, detail=f"{file.filename}: only JPEG, PNG and WebP images are allowed")
        validated.append((data, image_type))
    urls = [storage_upload(user_id, data, image_type) for data, image_type in validated]
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

