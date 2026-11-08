import asyncio
import logging

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
from application.service.db_errors import map_integrity_errors

logger = logging.getLogger(__name__)

MAX_PHOTOS = 5
MAX_TAGS = 20


def _check_tag_count(tags: list[int]) -> None:
    if len(set(tags)) > MAX_TAGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot exceed {MAX_TAGS} tags",
        )


class ProfileService:
    def __init__(self, db: Database):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)
        self.profile_repo = ProfileRepository(db)
        self.social_repo = SocialRepository(db)

    async def set_profile(self, user_id: int, request: SetProfileRequest):
        _check_tag_count(request.tags)
        pool = self.db.require_pool()
        with map_integrity_errors(fk_detail="Unknown tag"):
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    await self.profile_repo.set_profile(user_id, request, conn)
                    await self.profile_repo.add_tags(user_id, request.tags, conn)

    async def get_profile(self, user_id: int) -> ProfileResponse:
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
            first_name=profile["first_name"],
            last_name=profile["last_name"],
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

    async def update_profile(self, user_id: int, request: UpdateProfileRequest) -> ProfileResponse:
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

        if tags is not None:
            _check_tag_count(tags)

        pool = self.db.require_pool()
        with map_integrity_errors(fk_detail="Unknown tag"):
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    if updates:
                        await self.profile_repo.update_profile(user_id, updates, conn)
                    if tags is not None:
                        current = set(await self.profile_repo.get_user_tag_ids(user_id))
                        desired = set(tags)
                        to_add = list(desired - current)
                        to_remove = list(current - desired)
                        if to_add:
                            await self.profile_repo.add_tags(user_id, to_add, conn)
                        if to_remove:
                            await self.profile_repo.delete_tags(user_id, to_remove, conn)

        return await self.get_profile(user_id)

    async def set_location(self, user_id: int, request: SetLocationRequest) -> LocationResponse:
        has_coords = request.latitude is not None and request.longitude is not None
        if not has_coords and not request.city:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide either GPS coordinates or a city",
            )

        if request.latitude is not None and request.longitude is not None:
            latitude, longitude = request.latitude, request.longitude
            try:
                location_label = await geocoding.reverse_geocode(latitude, longitude)
            except Exception as e:
                # Coordinates are still valid; only the display label is missing.
                logger.warning("Reverse geocoding failed: %s", type(e).__name__)
                location_label = None
        else:
            try:
                geocoded = await geocoding.geocode_city(request.city or "")
            except Exception as e:
                logger.warning("Geocoding failed: %s", type(e).__name__)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Location service unavailable — try again later",
                )
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

    async def set_profile_picture(self, user_id: int, photo_id: int) -> PhotoResponse:
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

    async def upload_photos(
        self, user_id: int, files: list[tuple[bytes, str]]
    ) -> list[PhotoResponse]:
        """Store already-validated (bytes, content_type) pairs and record them.

        Everything runs under the per-user photo lock: the cap is checked before
        any object is written, and if a later step fails, the objects written here
        are removed before another upload or delete of this user can run.
        """
        from application.clients import storage

        pool = self.db.require_pool()
        async with pool.acquire() as connection:
            async with connection.transaction():
                conn = cast(Connection, connection)
                await self.profile_repo.lock_user_photos(user_id, conn)

                # Keys are content hashes: dedupe within the batch, skip ones the user has.
                by_key = {storage.photo_key(user_id, data): (data, ctype) for data, ctype in files}
                existing = set(await self.profile_repo.get_existing_urls(user_id, list(by_key), conn))
                new = {key: item for key, item in by_key.items() if key not in existing}
                current_count = await self.profile_repo.count_photos(user_id, conn)
                if current_count + len(new) > MAX_PHOTOS:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot exceed {MAX_PHOTOS} photos",
                    )
                if not new:
                    return []

                stored: list[str] = []
                try:
                    for data, ctype in new.values():
                        stored.append(
                            await asyncio.to_thread(storage.upload_photo, user_id, data, ctype)
                        )
                    rows = await self.profile_repo.add_photos(
                        user_id, stored, start_order=current_count + 1, transaction=conn
                    )
                except BaseException:
                    # No row references these keys (checked under the lock above),
                    # so removing them can't break another photo. Shielded so a
                    # client disconnect (CancelledError) still cleans up.
                    await asyncio.shield(self._remove_objects(stored))
                    raise

        photos = []
        for row in rows:
            photo = dict(row)
            photo["url"] = to_photo_url(photo["url"])
            photos.append(PhotoResponse(**photo))
        return photos

    async def _remove_objects(self, keys: list[str]) -> None:
        from application.clients import storage

        for key in keys:
            try:
                await asyncio.to_thread(storage.delete_photo, key)
            except Exception as e:
                logger.warning("Could not remove orphaned photo object: %s", type(e).__name__)

    async def delete_photos(self, user_id: int, photo_ids: list[int]) -> list[int]:
        from application.clients.storage import delete_photo

        pool = self.db.require_pool()
        async with pool.acquire() as connection:
            async with connection.transaction():
                conn = cast(Connection, connection)
                # Same lock as uploads: an upload of identical bytes can't re-reference
                # an object between its row being deleted and the object being removed.
                await self.profile_repo.lock_user_photos(user_id, conn)
                urls = await self.profile_repo.get_photos_urls(user_id, photo_ids, conn)
                deleted_ids = await self.profile_repo.delete_photos(user_id, photo_ids, conn)
                if not deleted_ids:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="No matching photos found",
                    )
                for url in urls:
                    try:
                        await asyncio.to_thread(delete_photo, url)
                    except Exception as e:
                        # The row is gone, so the object is unreachable through the
                        # API, but it still holds a private image: make it visible.
                        logger.error("Photo object not deleted from storage: %s", type(e).__name__)
        return deleted_ids

