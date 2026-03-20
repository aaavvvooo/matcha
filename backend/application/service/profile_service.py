from fastapi import HTTPException, status
from datetime import timedelta, datetime, timezone
import hashlib
from typing import cast
from asyncpg.connection import Connection

from application.schema.profile_schemas import (
    SetProfileRequest,
    ProfileRequest,
    ProfileResponse
)

from application.database import Database
from application.repository.token_repo import TokenRepository
from application.repository.user_repo import UserRepository
from application.repository.profile_repo import ProfileRepository


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