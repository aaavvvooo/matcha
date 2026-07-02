from fastapi import APIRouter, Depends, Request

from application.schema.users_schemas import (
    UserProfileResponse,
    LikeResponse,
    SimpleUserResponse,
    ViewerResponse,
)
from application.database import get_db, Database
from application.service.social_service import SocialService
from application.utils import get_current_user
from application.limiter import limiter


router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/{user_id}", response_model=UserProfileResponse)
@limiter.limit("60/minute")
async def get_user(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    viewer_id = current_user["user"]["id"]
    service = SocialService(db)
    return await service.get_user_profile(viewer_id, user_id)


@router.post("/{user_id}/like", response_model=LikeResponse)
@limiter.limit("60/minute")
async def like_user(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    liker_id = current_user["user"]["id"]
    service = SocialService(db)
    return await service.like(liker_id, user_id)


@router.delete("/{user_id}/like", response_model=LikeResponse)
@limiter.limit("60/minute")
async def unlike_user(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    liker_id = current_user["user"]["id"]
    service = SocialService(db)
    return await service.unlike(liker_id, user_id)


@router.post("/{user_id}/block")
@limiter.limit("30/minute")
async def block_user(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    blocker_id = current_user["user"]["id"]
    service = SocialService(db)
    return await service.block(blocker_id, user_id)


@router.post("/{user_id}/report")
@limiter.limit("30/minute")
async def report_user(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    reporter_id = current_user["user"]["id"]
    service = SocialService(db)
    return await service.report(reporter_id, user_id)


@router.get("/{user_id}/views", response_model=list[ViewerResponse])
@limiter.limit("30/minute")
async def get_views(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = SocialService(db)
    return await service.get_viewers(current_user["user"]["id"], user_id)


@router.get("/{user_id}/likes", response_model=list[SimpleUserResponse])
@limiter.limit("30/minute")
async def get_likes(
    request: Request,
    user_id: int,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = SocialService(db)
    return await service.get_likers(current_user["user"]["id"], user_id)
