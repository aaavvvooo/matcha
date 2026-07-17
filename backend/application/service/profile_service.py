from fastapi import HTTPException, status
from typing import cast
from asyncpg.connection import Connection

from application.schema.profile_schemas import (
    SetProfileRequest,
    UpdateProfileRequest,
    SetLocationRequest,
    ProfileResponse,
    PhotoResponse,
    LocationResponse,
)
from application.clients import geocoding_client as geocoding
from application.utils.photo_url import to_photo_url
from application.database import Database
from application.repository.token_repo import TokenRepository
from application.repository.user_repo import UserRepository
from application.repository.profile_repo import ProfileRepository
from application.repository.social_repo import SocialRepository

MAX_PHOTOS = 5
MAX_TAGS = 20


class ProfileService:
    def __init__(self, db: Database):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)
        self.profile_repo = ProfileRepository(db)
        self.social_repo = SocialRepository(db)

    async def set_profile(self, request: SetProfileRequest):
        try:
            pool = self.db.require_pool()
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    photos_record = await self.profile_repo.set_photos(request.user_id, request.photos, conn)
                    tags_record = await self.profile_repo.add_tags(request.user_id, request.tags)
                    profile_record = await self.profile_repo.set_profile(request, conn)
            return profile_record, tags_record, photos_record
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
            views_count = await self.social_repo.count_viewers(user_id)
            likes_count = await self.social_repo.count_likers(user_id)

            photos = []
            for row in photos_rows:
                data = dict(row)
                data["url"] = to_photo_url(data["url"])
                photos.append(PhotoResponse(**data))
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
                views_count=views_count,
                likes_count=likes_count,
                latitude=profile["latitude"],
                longitude=profile["longitude"],
                location_label=profile["location_label"],
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
            tags = updates.pop("tags", None)

            if not updates and tags is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No fields to update",
                )

            if updates:
                await self.profile_repo.update_profile(user_id, updates)

            if tags is not None:
                if len(tags) > MAX_TAGS:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot exceed {MAX_TAGS} tags",
                    )
                current = set(await self.profile_repo.get_user_tag_ids(user_id))
                desired = set(tags)
                to_add = list(desired - current)
                to_remove = list(current - desired)
                if to_add:
                    await self.profile_repo.add_tags(user_id, to_add)
                if to_remove:
                    await self.profile_repo.delete_tags(user_id, to_remove)

            return await self.get_profile(user_id)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def set_location(self, user_id: int, request: SetLocationRequest) -> LocationResponse:
        try:
            has_coords = request.latitude is not None and request.longitude is not None
            if not has_coords and not request.city:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Provide either GPS coordinates or a city",
                )

            if has_coords:
                latitude, longitude = request.latitude, request.longitude
                try:
                    location_label = await geocoding.reverse_geocode(latitude, longitude)
                except Exception:
                    location_label = None
            else:
                try:
                    geocoded = await geocoding.geocode_city(request.city)
                except Exception:
                    geocoded = None
                if not geocoded:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Could not find that location — try a different city",
                    )
                latitude, longitude, location_label = geocoded

            updated = await self.profile_repo.set_location(user_id, latitude, longitude, location_label)
            if not updated:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Profile not found — complete profile setup first",
                )
            return LocationResponse(**dict(updated))
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
            data = dict(photo)
            data["url"] = to_photo_url(data["url"])
            return PhotoResponse(**data)
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

            existing = await self.profile_repo.get_existing_urls(user_id, urls)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Photo already uploaded",
                )

            rows = await self.profile_repo.add_photos(user_id, urls, start_order=current_count + 1)
            photos = []
            for row in rows:
                data = dict(row)
                data["url"] = to_photo_url(data["url"])
                photos.append(PhotoResponse(**data))
            return photos
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def delete_photos(self, user_id: int, photo_ids: list[int]) -> list[int]:
        try:
            urls = await self.profile_repo.get_photos_urls(user_id, photo_ids)
            deleted_ids = await self.profile_repo.delete_photos(user_id, photo_ids)
            if not deleted_ids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No matching photos found",
                )
            from application.clients.minio_client import delete_photo
            for url in urls:
                try:
                    delete_photo(url)
                except Exception:
                    pass
            return deleted_ids
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

