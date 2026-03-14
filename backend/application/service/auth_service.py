from fastapi import HTTPException, status
from datetime import timedelta, datetime, timezone
import hashlib
from typing import cast
from asyncpg.connection import Connection

from application.repository import UserRepository, TokenRepository
from application.schema import RegisterRequest, RegisterUserResponse, TokenInfo
from application.utils import (
    get_password_hash,
    validate_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_verification_token,
    decode_token,
    create_password_reset_token,
)
from application.tasks.email_tasks import send_password_reset_email_task
from application.database import Database
from application.redis_client import get_redis


class AuthService:
    def __init__(self, db: Database):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)

    async def register(self, request: RegisterRequest):
        try:
            user = await self.user_repo.get_user_by_email(request.email)
            if user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered",
                )

            user = await self.user_repo.get_user_by_username(request.username)
            if user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken",
                )

            validate_password(request.password)
            hashed_password = get_password_hash(request.password)
            verification_token = create_verification_token()
            hashed_verification_token = hashlib.sha256(
                verification_token.encode()
            ).hexdigest()
            expiration_date = datetime.now(timezone.utc) + timedelta(days=1)

            pool = self.db.require_pool()
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    user_record = await self.user_repo.create_user(
                        request.full_name,
                        request.username,
                        request.email,
                        hashed_password,
                        conn,
                    )
                    user = RegisterUserResponse(**user_record)
                    await self.token_repo.create_verification_token(
                        user.id,
                        hashed_verification_token,
                        "email",
                        expiration_date,
                        conn,
                    )
            return user, verification_token
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def verify_email(self, token: str):
        try:
            hashed_token = hashlib.sha256(token.encode()).hexdigest()
            token_record = await self.token_repo.get_verification_token(hashed_token)
            if not token_record:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token"
                )
            token_info = TokenInfo(**token_record)
            if token_info.used or token_info.expires_at < datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired"
                )

            pool = self.db.require_pool()
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    await self.token_repo.mark_token_as_used(token_info.id, conn)
                    user_record = await self.user_repo.update_user(
                        {"id": token_info.user_id, "is_validated": True}, conn
                    )
            user = RegisterUserResponse(**user_record)
            return user
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def login(self, username: str, password: str):
        try:
            user = await self.user_repo.get_user_by_username(username)
            if not user:
                user = await self.user_repo.get_user_by_email(username)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid credentials",
                )
            if not verify_password(password, user["hashed_password"]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid credentials",
                )
            if not user["is_validated"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Email not verified"
                )
            access_token = create_access_token(data={"sub": user["username"]})
            refresh_token = create_refresh_token(data={"sub": user["username"]})
            refresh_token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
            async with get_redis() as redis:
                await redis.setex(
                    f"refresh:{user['username']}",
                    7 * 24 * 60 * 60,
                    refresh_token_hash,
                )
            return access_token, refresh_token
        except HTTPException:
            raise
        except Exception as e:
            raise (
                HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Internal server error: {e}",
                )
            )

    async def logout(self, token: str):
        try:
            payload = decode_token(token)
            if not payload:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token"
                )

            exp = payload.get("exp")
            if not exp:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Token missing expiration",
                )

            if isinstance(exp, (int, float)):
                exp_time = datetime.fromtimestamp(exp, tz=timezone.utc)
            elif isinstance(exp, datetime):
                exp_time = exp
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid token expiration",
                )

            if exp_time < datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired"
                )

            username = payload.get("sub")
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            ttl = int((exp_time - datetime.now(timezone.utc)).total_seconds())
            async with get_redis() as redis:
                await redis.setex(f"blacklist:{token_hash}", ttl, 1)
                if username:
                    await redis.delete(f"refresh:{username}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def refresh(self, refresh_token: str):
        try:
            payload = decode_token(refresh_token)
            if not payload or payload.get("type") != "refresh":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid refresh token",
                )

            username = payload.get("sub")
            if not username:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid refresh token",
                )

            incoming_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
            async with get_redis() as redis:
                stored_hash = await redis.get(f"refresh:{username}")

            if not stored_hash or stored_hash != incoming_hash:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token revoked",
                )

            new_access_token = create_access_token(data={"sub": username})
            new_refresh_token = create_refresh_token(data={"sub": username})
            new_refresh_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()

            async with get_redis() as redis:
                await redis.setex(
                    f"refresh:{username}", 7 * 24 * 60 * 60, new_refresh_hash
                )

            return new_access_token, new_refresh_token
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def forget_password(self, username_or_email: str):
        try:
            user = await self.user_repo.get_user_by_email(username_or_email)
            if not user:
                user = await self.user_repo.get_user_by_username(username_or_email)

            if user:
                tokens = await create_password_reset_token()
                await self.token_repo.create_verification_token(
                    user_id=user["id"],
                    token=tokens["hashed_token"],
                    token_type="password_reset",
                    expires_at=tokens["expiry"],
                )
                send_password_reset_email_task.delay(
                    to=user["email"], username=user["username"], token=tokens["token"]
                )
            return {"message": "If the account exists, a reset email has been sent"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal server error: {e}",
            )

    async def reset_password(self, token: str, password: str):
        hashed_token = hashlib.sha256(token.encode()).hexdigest()
        try:
            token_record = await self.token_repo.get_verification_token(hashed_token)
            if not token_record:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token"
                )
            token_info = TokenInfo(**token_record)
            if token_info.expires_at < datetime.now(timezone.utc) or token_info.used:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired"
                )

            validate_password(password)
            hashed_password = get_password_hash(password)

            pool = self.db.require_pool()
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    user_record = await self.user_repo.update_user(
                        {"id": token_info.user_id, "hashed_password": hashed_password},
                        conn,
                    )
                    await self.token_repo.mark_token_as_used(token_info.id, conn)
            return user_record

        except Exception:
            raise
