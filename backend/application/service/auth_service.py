import hashlib
import hmac
from dataclasses import dataclass
from datetime import timedelta, datetime, timezone
from typing import Optional, cast

from asyncpg.connection import Connection
from fastapi import HTTPException, status

from application.repository import UserRepository, TokenRepository
from application.schema import RegisterRequest, RegisterUserResponse, TokenInfo
from application.schema.fields import has_unsafe_chars
from application.schema.users_schemas import UpdateMeRequest, MeResponse
from application.utils import (
    burn_password_check,
    get_password_hash,
    validate_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_verification_token,
    decode_token,
    create_password_reset_token,
    parse_session_claims,
    session_claims,
)
from application.websocket.manager import presence_manager
from application.database import Database
from application.service.db_errors import map_integrity_errors

# verification_tokens.token_type values (DESIGN.md §4).
TOKEN_EMAIL = "email"                    # sign-up verification, or a pending email change (new_email set)
TOKEN_PASSWORD_RESET = "password_reset"

# Mail abuse (M3): per account, on top of the per-IP route limits.
EMAIL_COOLDOWN_SECONDS = 120     # no second mail of the same kind to one account within 2 minutes
EMAIL_CHANGES_PER_HOUR = 5       # pending email changes requested per account per hour

_MAX_IDENTIFIER = 254
_MAX_PASSWORD = 128


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _invalid_credentials() -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")


@dataclass
class ForgetPasswordResult:
    message: str
    email_to: Optional[str] = None
    email_username: Optional[str] = None
    email_token: Optional[str] = None

    @property
    def has_email(self) -> bool:
        return self.email_to is not None


@dataclass
class UpdateMeResult:
    response: MeResponse
    # Set when an email change was requested: the link goes to the NEW address.
    verification_token: Optional[str] = None
    email_to: Optional[str] = None


class AuthService:
    def __init__(self, db: Database):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)

    async def _find_account(self, identifier: str):
        """Username or email. An identifier with "@" is looked up as an email first: new
        usernames can't contain "@" (schema/fields.Username), so it can't shadow an address."""
        if "@" in identifier:
            user = await self.user_repo.get_user_by_email(identifier)
            return user or await self.user_repo.get_user_by_username(identifier)
        return await self.user_repo.get_user_by_username(identifier)

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
        expiration_date = datetime.now(timezone.utc) + timedelta(days=1)

        pool = self.db.require_pool()
        with map_integrity_errors():
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    user_record = await self.user_repo.create_user(
                        request.first_name,
                        request.last_name,
                        request.username,
                        request.email,
                        hashed_password,
                        conn,
                    )
                    user = RegisterUserResponse(**user_record)
                    await self.token_repo.create_verification_token(
                        user.id,
                        _hash_token(verification_token),
                        TOKEN_EMAIL,
                        expiration_date,
                        conn,
                    )
        return user, verification_token

    async def verify_email(self, token: str):
        """Confirms a sign-up address, or applies a pending email change. Only an "email" token
        works here: a password-reset token is refused."""
        token_record = await self.token_repo.get_verification_token(_hash_token(token), TOKEN_EMAIL)
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
        with map_integrity_errors():
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    await self.user_repo.lock_user(token_info.user_id, conn)
                    if not await self.token_repo.consume_token(token_info.id, conn):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired"
                        )
                    if token_info.new_email:
                        # The address may have been taken since the change was requested; the
                        # unique index (uq_users_email_lower) is the backstop for a race.
                        if await self.user_repo.email_taken_by_other(
                            token_info.new_email, token_info.user_id, conn
                        ):
                            raise HTTPException(
                                status_code=status.HTTP_409_CONFLICT,
                                detail="Email already registered",
                            )
                        user_record = await self.user_repo.update_user(
                            token_info.user_id,
                            {"email": token_info.new_email, "is_validated": True},
                            conn,
                        )
                        # Every other outstanding token dies with this change: other pending
                        # changes, and reset links already mailed to the old address.
                        await self.token_repo.invalidate_user_tokens(token_info.user_id, None, conn)
                    else:
                        user_record = await self.user_repo.update_user(
                            token_info.user_id, {"is_validated": True}, conn
                        )
        return RegisterUserResponse(**user_record)

    async def login(self, username: str, password: str):
        if (
            not username
            or len(username) > _MAX_IDENTIFIER
            or len(password) > _MAX_PASSWORD
            or has_unsafe_chars(username)
            or has_unsafe_chars(password, allow="\t")
        ):
            raise _invalid_credentials()
        user = await self._find_account(username.strip())
        if not user:
            burn_password_check(password)
            raise _invalid_credentials()
        if not verify_password(password, user["hashed_password"]):
            raise _invalid_credentials()
        if not user["is_validated"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Email not verified"
            )
        return await self.issue_session(user["id"], user["token_version"])

    async def issue_session(self, user_id: int, token_version: int) -> tuple[str, str]:
        """Mint an access + refresh pair and store the refresh hash. Shared by
        password login, refresh and OAuth sign-in so all end in the same session state.
        Tokens carry the immutable user id (never the username) and the token version.
        Callers must have authenticated the user and checked is_validated."""
        claims = session_claims(user_id, token_version)
        access_token = create_access_token(data=claims)
        refresh_token = create_refresh_token(data=claims)
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await self.token_repo.upsert_refresh_token(user_id, _hash_token(refresh_token), expires_at)
        return access_token, refresh_token

    async def _current_session_user(self, payload: dict | None, token_type: str) -> int | None:
        """The user id of a signed token of `token_type` that still matches the account's token version."""
        if not payload or payload.get("type") != token_type:
            return None
        claims = parse_session_claims(payload)
        if claims is None:
            return None
        user_id, version = claims
        user = await self.user_repo.get_user_by_id(user_id)
        if not user or user["token_version"] != version:
            return None
        return user_id

    async def logout(self, access_token: str | None, refresh_token: str | None) -> None:
        """End the session server-side. Idempotent: never fails on a missing, expired
        or invalid token, so an expired access token can't keep the refresh token alive.
        """
        user_id = None

        # decode_token returns None for expired/invalid tokens, so only a live
        # access token gets blacklisted (until its own expiry).
        if access_token:
            access = decode_token(access_token)
            if access and access.get("type") == "access" and isinstance(access.get("exp"), (int, float)):
                await self.token_repo.blacklist_token(
                    _hash_token(access_token), datetime.fromtimestamp(access["exp"], tz=timezone.utc)
                )
                user_id = await self._current_session_user(access, "access")

        # The refresh cookie is signed, so it is a trustworthy source of the user id
        # when the access token has already expired.
        if user_id is None and refresh_token:
            user_id = await self._current_session_user(decode_token(refresh_token), "refresh")

        if user_id is not None:
            await self.token_repo.delete_refresh_token(user_id)
            # Open sockets were authenticated once; end them with the session.
            await presence_manager.close_user(user_id)

    async def refresh(self, refresh_token: str):
        revoked = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked"
        )
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )
        # Tokens minted before ids were used (sub=<username>) never resolve: sign in again.
        claims = parse_session_claims(payload)
        if claims is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )
        user_id, version = claims

        record = await self.token_repo.get_refresh_token(user_id)
        if not record or not hmac.compare_digest(record["token_hash"], _hash_token(refresh_token)):
            raise revoked
        user = await self.user_repo.get_user_by_id(user_id)
        if not user or not user["is_validated"] or user["token_version"] != version:
            raise revoked
        return await self.issue_session(user_id, user["token_version"])

    async def forget_password(self, username_or_email: str) -> ForgetPasswordResult:
        msg = "If the account exists, a reset email has been sent"
        user = await self._find_account(username_or_email)
        if not user:
            return ForgetPasswordResult(message=msg)

        tokens = await create_password_reset_token()
        pool = self.db.require_pool()
        async with pool.acquire() as connection:
            async with connection.transaction():
                conn = cast(Connection, connection)
                await self.user_repo.lock_user(user["id"], conn)
                recent = await self.token_repo.count_recent_tokens(
                    user["id"], TOKEN_PASSWORD_RESET, EMAIL_COOLDOWN_SECONDS, False, conn
                )
                if recent:
                    # Cooldown: same answer, no mail, so nothing is enumerable or floodable.
                    return ForgetPasswordResult(message=msg)
                # Only the newest reset link works.
                await self.token_repo.invalidate_user_tokens(user["id"], TOKEN_PASSWORD_RESET, conn)
                await self.token_repo.create_verification_token(
                    user_id=user["id"],
                    token=tokens["hashed_token"],
                    token_type=TOKEN_PASSWORD_RESET,
                    expires_at=tokens["expiry"],
                    transaction=conn,
                )
        return ForgetPasswordResult(
            message=msg,
            email_to=user["email"],
            email_username=user["username"],
            email_token=tokens["token"],
        )

    async def reset_password(self, token: str, password: str):
        """Sets the new password and ends every session of the account: all outstanding tokens
        (reset and email) are spent, the token version is bumped (outstanding access/refresh JWTs
        die), the refresh row is deleted and open sockets are closed. The reset link went to the
        account's address, so it also proves ownership of it (an unverified account becomes verified)."""
        token_record = await self.token_repo.get_verification_token(_hash_token(token), TOKEN_PASSWORD_RESET)
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
                if not await self.token_repo.consume_token(token_info.id, conn):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired"
                    )
                user_record = await self.user_repo.update_user(
                    token_info.user_id,
                    {"hashed_password": hashed_password, "is_validated": True},
                    conn,
                )
                await self.token_repo.invalidate_user_tokens(token_info.user_id, None, conn)
                await self.user_repo.bump_token_version(token_info.user_id, conn)
                await self.token_repo.delete_refresh_token(token_info.user_id, conn)
        await presence_manager.close_user(token_info.user_id)
        return user_record

    async def get_me(self, user_id: int) -> MeResponse:
        user = await self.user_repo.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        pending = await self.token_repo.get_pending_email(user_id)
        return MeResponse(**dict(user), pending_email=pending)

    async def update_me(self, user_id: int, request: UpdateMeRequest) -> UpdateMeResult:
        """Name/username apply at once. An email change does NOT touch users.email: the new
        address is stored with a verification token and applied only when that link (sent to
        the new address) is clicked; the account keeps working on its current, verified address."""
        updates = request.model_dump(exclude_none=True)
        new_email: Optional[str] = updates.pop("email", None)
        if not updates and new_email is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
            )

        current = await self.user_repo.get_user_by_id(user_id)
        if not current:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if "username" in updates:
            existing = await self.user_repo.get_user_by_username(updates["username"])
            if existing and existing["id"] != user_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Username already taken"
                )

        if new_email is not None and new_email.lower() == str(current["email"]).lower():
            new_email = None  # unchanged
        if new_email is not None and await self.user_repo.email_taken_by_other(new_email, user_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
            )

        verification_token: Optional[str] = None
        user_record = current
        pool = self.db.require_pool()
        with map_integrity_errors():
            async with pool.acquire() as connection:
                async with connection.transaction():
                    conn = cast(Connection, connection)
                    await self.user_repo.lock_user(user_id, conn)
                    if new_email is not None:
                        await self._check_email_change_budget(user_id, conn)
                    if updates:
                        user_record = await self.user_repo.update_user(user_id, updates, conn)
                    if new_email is not None:
                        verification_token = create_verification_token()
                        # One live pending change at a time; older links stop working.
                        await self.token_repo.invalidate_user_tokens(user_id, TOKEN_EMAIL, conn)
                        await self.token_repo.create_verification_token(
                            user_id,
                            _hash_token(verification_token),
                            TOKEN_EMAIL,
                            datetime.now(timezone.utc) + timedelta(days=1),
                            conn,
                            new_email=new_email,
                        )

        pending = new_email or await self.token_repo.get_pending_email(user_id)
        response = MeResponse(
            **dict(user_record),
            email_verification_sent=new_email is not None,
            pending_email=pending,
        )
        return UpdateMeResult(response=response, verification_token=verification_token, email_to=new_email)

    async def _check_email_change_budget(self, user_id: int, conn: Connection) -> None:
        if await self.token_repo.count_recent_tokens(
            user_id, TOKEN_EMAIL, EMAIL_COOLDOWN_SECONDS, True, conn
        ):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="A confirmation email was sent recently. Please wait a couple of minutes and try again.",
            )
        if await self.token_repo.count_recent_tokens(
            user_id, TOKEN_EMAIL, 3600, True, conn
        ) >= EMAIL_CHANGES_PER_HOUR:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many email changes. Please try again later.",
            )
