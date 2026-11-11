import asyncio

from fastapi import APIRouter, Depends, Request, UploadFile, File, Form, HTTPException
from typing import List, Optional

from application.schema.profile_schemas import (
    SetProfileRequest,
    UpdateProfileRequest,
    SetLocationRequest,
    SetProfilePicRequest,
    DeletePhotosRequest,
    ReorderPhotosRequest,
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
from application.utils.image import MAX_IMAGE_BYTES, InvalidImage, sanitize_image
from application.limiter import limiter
from application.schema.fields import INT4_MAX


router = APIRouter(dependencies=[Depends(get_current_user)])

# Decoding is memory-hungry (a 16 MP image is ~64 MB as RGBA): at most two at a time per process.
_DECODE_SLOTS = asyncio.Semaphore(2)


@router.post("/set", response_model=ProfileResponse)
@limiter.limit("10/hour")
async def set(
    request: Request,
    body: SetProfileRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    await service.set_profile(user_id, body)
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


@router.patch("/photo-order", response_model=list[PhotoResponse])
@limiter.limit("30/minute")
async def reorder_photos(
    request: Request,
    body: ReorderPhotosRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.reorder_photos(user_id, body.photo_ids)


@router.post("/upload-photo", response_model=list[PhotoResponse])
@limiter.limit("20/minute")
async def upload_photo(
    request: Request,
    files: List[UploadFile] = File(...),
    replaces: Optional[int] = Form(None, ge=1, le=INT4_MAX),
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    if len(files) > MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_PHOTOS} files per request")
    if replaces is not None and len(files) != 1:
        raise HTTPException(status_code=400, detail="Replacing a photo takes exactly one file")
    service = ProfileService(db)
    # Cheap early exit when already full (a replacement doesn't change the count).
    # The exact check (after skipping photos the user already has) runs under a row
    # lock in ProfileService.upload_photos.
    if replaces is None and await service.profile_repo.count_photos(user_id) >= MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Cannot exceed {MAX_PHOTOS} photos")
    # Validate (decode + re-encode, utils/image.py) every file before storing any, so a bad
    # file never leaves orphans in storage. Only the re-encoded bytes are kept: they are what
    # gets stored, hashed into the object key and so compared for duplicates.
    validated: list[tuple[bytes, str]] = []
    for index, file in enumerate(files, start=1):
        data = await file.read(MAX_IMAGE_BYTES + 1)
        label = f"Photo {index}" if len(files) > 1 else "Photo"
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail=f"{label}: file size must not exceed 5 MB")
        try:
            async with _DECODE_SLOTS:
                validated.append(await asyncio.to_thread(sanitize_image, data))
        except InvalidImage as e:
            raise HTTPException(status_code=400, detail=f"{label}: {e}") from None
    if replaces is not None:
        data, image_type = validated[0]
        return [await service.replace_photo(user_id, replaces, data, image_type)]
    return await service.upload_photos(user_id, validated)



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

