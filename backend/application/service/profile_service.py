from fastapi import HTTPException, status
from typing import cast
from asyncpg.connection import Connection

from application.schema.profile_schemas import (
    SetProfileRequest,
    UpdateProfileRequest,
    ProfileResponse,
    PhotoResponse,
)
from application.database import Database
from application.repository.token_repo import TokenRepository
from application.repository.user_repo import UserRepository
from application.repository.profile_repo import ProfileRepository

MAX_PHOTOS = 5
MAX_TAGS = 20


class ProfileService:
    def __init__(self, db: Database):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)
        self.profile_repo = ProfileRepository(db)

    async def set_profile(self, request: SetProfileRequest):
        try:
            pool = self.db.require_pool()
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    photos_record = await self.profile_repo.set_photos(request.user_id, request.photos, conn)
                    profile_record = await self.profile_repo.set_profile(request, conn)
            return profile_record, photos_record
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def get_profile(self, user_id: int) -> ProfileResponse:
        try:
            profile = await self.profile_repo.get_profile(user_id)
            if not profile:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Profile not found",
                )
            photos_rows = await self.profile_repo.get_user_photos(user_id)
            tag_ids = await self.profile_repo.get_user_tag_ids(user_id)

            photos = [PhotoResponse(**dict(row)) for row in photos_rows]
            return ProfileResponse(
                user_id=profile["user_id"],
                full_name=profile["full_name"],
                username=profile["username"],
                email=profile["email"],
                bio=profile["bio"],
                birth_date=profile["birth_date"],
                gender=profile["gender"],
                sexual_orientation=profile["sexual_orientation"],
                profile_picture_id=profile["profile_picture_id"],
                fame_rating=profile["fame_rating"],
                tags=tag_ids,
                photos=photos,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def update_profile(self, user_id: int, request: UpdateProfileRequest) -> ProfileResponse:
        try:
            profile = await self.profile_repo.get_profile(user_id)
            if not profile:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Profile not found",
                )

            updates = request.model_dump(exclude_none=True)
            if not updates:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No fields to update",
                )

            await self.profile_repo.update_profile(user_id, updates)
            return await self.get_profile(user_id)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def set_profile_picture(self, user_id: int, photo_id: int) -> PhotoResponse:
        try:
            owner = await self.profile_repo.get_photo_owner(photo_id)
            if owner is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Photo not found",
                )
            if owner != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Photo does not belong to you",
                )

            photo = await self.profile_repo.set_profile_picture(user_id, photo_id)
            if not photo:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Photo not found",
                )
            return PhotoResponse(**dict(photo))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def add_photos(self, user_id: int, urls: list[str]) -> list[PhotoResponse]:
        try:
            current_count = await self.profile_repo.count_photos(user_id)
            if current_count + len(urls) > MAX_PHOTOS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot exceed {MAX_PHOTOS} photos",
                )

            rows = await self.profile_repo.add_photos(user_id, urls, start_order=current_count + 1)
            return [PhotoResponse(**dict(row)) for row in rows]
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def delete_photos(self, user_id: int, photo_ids: list[int]) -> list[int]:
        try:
            deleted_ids = await self.profile_repo.delete_photos(user_id, photo_ids)
            if not deleted_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No matching photos found",
                )
            return deleted_ids
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def add_tags(self, user_id: int, tag_ids: list[int]) -> list[int]:
        try:
            current_count = await self.profile_repo.count_tags(user_id)
            if current_count + len(tag_ids) > MAX_TAGS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot exceed {MAX_TAGS} tags",
                )

            await self.profile_repo.add_tags(user_id, tag_ids)
            return await self.profile_repo.get_user_tag_ids(user_id)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def delete_tags(self, user_id: int, tag_ids: list[int]) -> list[int]:
        try:
            await self.profile_repo.delete_tags(user_id, tag_ids)
            return await self.profile_repo.get_user_tag_ids(user_id)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )
