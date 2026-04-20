from fastapi import APIRouter, Depends, Request

from application.schema.profile_schemas import (
    SetProfileRequest,
    UpdateProfileRequest,
    SetProfilePicRequest,
    AddPhotosRequest,
    DeletePhotosRequest,
    AddTagsRequest,
    DeleteTagsRequest,
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
    request: Request, body: SetProfileRequest, db: Database = Depends(get_db)
):
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


@router.post("/add-photos", response_model=list[PhotoResponse])
@limiter.limit("20/minute")
async def add_photos(
    request: Request,
    body: AddPhotosRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.add_photos(user_id, body.photos)


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


@router.post("/add-tags", response_model=list[int])
@limiter.limit("20/minute")
async def add_tags(
    request: Request,
    body: AddTagsRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.add_tags(user_id, body.tag_ids)


@router.delete("/delete-tags", response_model=list[int])
@limiter.limit("20/minute")
async def delete_tags(
    request: Request,
    body: DeleteTagsRequest,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"]["id"]
    service = ProfileService(db)
    return await service.delete_tags(user_id, body.tag_ids)
