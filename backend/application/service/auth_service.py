from fastapi import HTTPException, status
from datetime import timedelta, datetime, timezone
import hashlib
from dataclasses import dataclass
from typing import cast, Optional
from asyncpg.connection import Connection

from application.repository import UserRepository, TokenRepository
from application.schema import RegisterRequest, RegisterUserResponse, TokenInfo
from application.schema.users_schemas import UpdateMeRequest, MeResponse
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
from application.database import Database
from application.service.db_errors import map_integrity_errors


@dataclass
class ForgetPasswordResult:
    message: str
    email_to: Optional[str] = None
    email_username: Optional[str] = None
    email_token: Optional[str] = None

    @property
    def has_email(self) -> bool:
        return self.email_to is not None


class AuthService:
    def __init__(self, db: Database):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)

    async def register(self, request: RegisterRequest):
        user = await self.user_repo.get_user_by_email(request.email)
        if user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        user = await self.user_repo.get_user_by_username(request.username)
        if user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
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
        with map_integrity_errors():
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

    async def verify_email(self, token: str):
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
                    token_info.user_id, {"is_validated": True}, conn
                )
        user = RegisterUserResponse(**user_record)
        return user

    async def login(self, username: str, password: str):
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
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await self.token_repo.upsert_refresh_token(user["username"], refresh_token_hash, expires_at)
        return access_token, refresh_token

    async def logout(self, access_token: str | None, refresh_token: str | None) -> None:
        """End the session server-side. Idempotent: never fails on a missing, expired
        or invalid token, so an expired access token can't keep the refresh token alive.
        """
        username = None

        # decode_token returns None for expired/invalid tokens, so only a live
        # access token gets blacklisted (until its own expiry).
        if access_token:
            access = decode_token(access_token)
            if access and access.get("type") == "access" and isinstance(access.get("exp"), (int, float)):
                username = access.get("sub")
                token_hash = hashlib.sha256(access_token.encode()).hexdigest()
                await self.token_repo.blacklist_token(
                    token_hash, datetime.fromtimestamp(access["exp"], tz=timezone.utc)
                )

        # The refresh cookie is signed, so it is a trustworthy source of the username
        # when the access token has already expired.
        if not username and refresh_token:
            refresh = decode_token(refresh_token)
            if refresh and refresh.get("type") == "refresh":
                username = refresh.get("sub")

        if username:
            await self.token_repo.delete_refresh_token(username)

    async def refresh(self, refresh_token: str):
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
        record = await self.token_repo.get_refresh_token(username)

        if not record or record["token_hash"] != incoming_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token revoked",
            )

        new_access_token = create_access_token(data={"sub": username})
        new_refresh_token = create_refresh_token(data={"sub": username})
        new_refresh_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()
        new_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await self.token_repo.upsert_refresh_token(username, new_refresh_hash, new_expires_at)

        return new_access_token, new_refresh_token

    async def forget_password(self, username_or_email: str) -> ForgetPasswordResult:
        msg = "If the account exists, a reset email has been sent"
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
            return ForgetPasswordResult(
                message=msg,
                email_to=user["email"],
                email_username=user["username"],
                email_token=tokens["token"],
            )
        return ForgetPasswordResult(message=msg)

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
                        token_info.user_id,
                        {"hashed_password": hashed_password},
                        conn,
                    )
                    await self.token_repo.mark_token_as_used(token_info.id, conn)
            return user_record

        except Exception:
            raise

    async def update_me(self, user_id: int, request: UpdateMeRequest):
        updates = request.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
            )

        if "username" in updates:
            existing = await self.user_repo.get_user_by_username(updates["username"])
            if existing and existing["id"] != user_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Username already taken"
                )

        email_changed = "email" in updates
        verification_token = None
        if email_changed:
            existing = await self.user_repo.get_user_by_email(updates["email"])
            if existing and existing["id"] != user_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
                )
            updates["is_validated"] = False
            verification_token = create_verification_token()
            hashed_verification_token = hashlib.sha256(
                verification_token.encode()
            ).hexdigest()
            expiration_date = datetime.now(timezone.utc) + timedelta(days=1)

        pool = self.db.require_pool()
        with map_integrity_errors():
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    user_record = await self.user_repo.update_user(user_id, updates, conn)
                    if email_changed:
                        await self.token_repo.create_verification_token(
                            user_id, hashed_verification_token, "email", expiration_date, conn
                        )

        response = MeResponse(**dict(user_record), email_verification_sent=email_changed)
        return response, verification_token
