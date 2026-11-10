"""OAuth sign-in (bonus B1): state/PKCE bookkeeping and account linking.

Flow state: /start stores {provider, state, code_verifier} server-side under an
opaque random id that goes to the browser in a short-lived httpOnly cookie. The
callback pops that entry (single use, whatever the outcome) and compares `state`
in constant time. The store is in-process memory, like the WebSocket registry
and rate limiter: fine for the single-process deployment, lost on restart (the
user just clicks the button again).

Linking rules (never trust an address the provider does not mark verified):
  1. provider identity already linked          -> that user
  2. provider-verified email == validated user -> link + that user
     provider-verified email == unvalidated    -> refuse (link_unverified)
     unverified/absent email == existing user  -> refuse (email_in_use), no link
  3. otherwise create a user + link in one transaction; is_validated only when
     the provider verified the email, else a verification email is sent and no
     session is issued until the link in it is clicked.
"""

import base64
import hashlib
import hmac
import logging
import re
import secrets
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, cast

import asyncpg
from asyncpg.connection import Connection
from fastapi import HTTPException, status
from pydantic.networks import validate_email
from pydantic_core import PydanticCustomError

from application.clients.oauth_client import (
    PROVIDERS,
    ProviderConfig,
    ProviderIdentity,
    authorization_url,
)
from application.database import Database
from application.repository import TokenRepository, UserRepository
from application.repository.oauth_repo import OAuthRepository
from application.service.auth_service import AuthService
from application.utils import create_verification_token, get_password_hash

logger = logging.getLogger(__name__)

STATE_TTL_SECONDS = 600
_MAX_PENDING = 10_000
_MAX_STATE_LEN = 128
_NAME_MAX = 50  # users.first_name / last_name VARCHAR(50)
_USERNAME_BASE_MAX = 40  # leaves room for a numeric suffix under the 50-char limit

# Fixed set of error codes the frontend maps to messages; nothing else is ever sent.
# (Success is status=ok, or status=verify_email for a new account awaiting verification.)
ERROR_CODES = frozenset({
    "access_denied",     # user cancelled at the provider
    "invalid_state",     # missing / expired / replayed / mismatched state
    "provider_error",    # token exchange or profile fetch failed
    "no_email",          # provider gave no usable address
    "email_in_use",      # local account has this address but it can't be linked
    "link_unverified",   # local account with this address hasn't verified it
    "already_linked",    # local account already linked to another identity of this provider
    "email_unverified",  # linked account whose email isn't verified yet
    "email_unavailable", # new account needs a verification email but email is down
    "server_error",
})


class OAuthFlowError(HTTPException):
    """Ends the flow with one of ERROR_CODES (the callback turns it into a redirect)."""

    def __init__(self, code: str):
        if code not in ERROR_CODES:
            code = "server_error"
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=code)
        self.code = code


@dataclass(frozen=True)
class _Pending:
    provider: str
    state: str
    code_verifier: Optional[str]
    expires_at: float


_pending: dict[str, _Pending] = {}


def _purge_expired(now: float) -> None:
    for key in [k for k, v in _pending.items() if v.expires_at <= now]:
        del _pending[key]


def get_enabled_provider(provider_id: str) -> ProviderConfig:
    provider = PROVIDERS.get(provider_id)
    if provider is None or not provider.enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return provider


def begin(provider: ProviderConfig) -> tuple[str, str]:
    """Returns (provider authorize URL, opaque flow id for the cookie)."""
    now = time.monotonic()
    _purge_expired(now)
    if len(_pending) >= _MAX_PENDING:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Too many sign-in attempts in progress, try again shortly",
        )
    state = secrets.token_urlsafe(32)  # 256 bits
    verifier = challenge = None
    if provider.pkce:
        verifier = secrets.token_urlsafe(64)  # 86 chars, within RFC 7636's 43..128
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    flow_id = secrets.token_urlsafe(32)
    _pending[flow_id] = _Pending(provider.id, state, verifier, now + STATE_TTL_SECONDS)
    return authorization_url(provider, state, challenge), flow_id


def consume(flow_id: Optional[str], provider_id: str, state: Optional[str]) -> Optional[str]:
    """Validate and burn the pending flow. Returns the PKCE verifier (or None)."""
    entry = _pending.pop(flow_id, None) if flow_id else None
    if entry is None or entry.expires_at <= time.monotonic():
        raise OAuthFlowError("invalid_state")
    if not state or len(state) > _MAX_STATE_LEN:
        raise OAuthFlowError("invalid_state")
    same_state = hmac.compare_digest(entry.state.encode(), state.encode())
    if not same_state or entry.provider != provider_id:
        raise OAuthFlowError("invalid_state")
    return entry.code_verifier


def discard(flow_id: Optional[str]) -> None:
    if flow_id:
        _pending.pop(flow_id, None)


# --- profile data sanitising --------------------------------------------------

def _clean_name(raw: str) -> str:
    text = "".join(ch for ch in raw if not unicodedata.category(ch).startswith("C"))
    return " ".join(text.split())[:_NAME_MAX].strip()


def _username_base(login: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_-]", "", login)[:_USERNAME_BASE_MAX]
    return base if len(base) >= 3 else "user"


def _username_candidates(base: str):
    yield base
    for n in range(2, 10):
        yield f"{base}{n}"
    for _ in range(5):
        yield f"{base}{secrets.randbelow(900_000) + 100_000}"


def _normalise_email(raw: Optional[str]) -> Optional[str]:
    if not raw or len(raw) > 254:
        return None
    try:
        _, email = validate_email(raw)
    except (PydanticCustomError, ValueError):
        return None
    return email


@dataclass
class OAuthResult:
    """Either a session (access/refresh) or a pending verification email."""
    username: str
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    email_to: Optional[str] = None
    verification_token: Optional[str] = None


class OAuthService:
    def __init__(self, db: Database):
        self.db = db
        self.oauth_repo = OAuthRepository(db)
        self.user_repo = UserRepository(db)
        self.token_repo = TokenRepository(db)

    async def _session_for(self, user) -> OAuthResult:
        if not user["is_validated"]:
            # Same rule as password login; also covers a pending email change.
            raise OAuthFlowError("email_unverified")
        access, refresh = await AuthService(self.db).issue_session(user["username"])
        return OAuthResult(username=user["username"], access_token=access, refresh_token=refresh)

    async def _linked_session(self, provider: str, provider_user_id: str) -> OAuthResult:
        linked = await self.oauth_repo.get_linked_user(provider, provider_user_id)
        if linked is None:
            raise OAuthFlowError("server_error")
        return await self._session_for(linked)

    async def sign_in(
        self, provider: ProviderConfig, identity: ProviderIdentity, email_available: bool
    ) -> OAuthResult:
        pid = identity.provider_user_id

        # 1. Known identity.
        linked = await self.oauth_repo.get_linked_user(provider.id, pid)
        if linked is not None:
            return await self._session_for(linked)

        email = _normalise_email(identity.email)
        if email is None:
            raise OAuthFlowError("no_email")
        verified = identity.email_verified

        # 2. Existing local account with this address (case-insensitive).
        matches = await self.oauth_repo.find_users_by_email(email)
        if len(matches) > 1:
            raise OAuthFlowError("email_in_use")
        if matches:
            local = matches[0]
            if not verified:
                raise OAuthFlowError("email_in_use")
            if not local["is_validated"]:
                raise OAuthFlowError("link_unverified")
            try:
                await self.oauth_repo.link(local["id"], provider.id, pid)
            except asyncpg.UniqueViolationError as e:
                if e.constraint_name == "uq_oauth_accounts_provider_user":
                    return await self._linked_session(provider.id, pid)  # concurrent callback won
                raise OAuthFlowError("already_linked") from None
            logger.info("OAuth: linked %s identity to existing user id=%s", provider.id, local["id"])
            return await self._session_for(local)

        # 3. New account.
        if not verified and not email_available:
            raise OAuthFlowError("email_unavailable")
        return await self._create(provider, identity, email, verified)

    async def _create(
        self, provider: ProviderConfig, identity: ProviderIdentity, email: str, verified: bool
    ) -> OAuthResult:
        base = _username_base(identity.login)
        first_name = _clean_name(identity.first_name) or _clean_name(identity.login)[:_NAME_MAX] or base
        last_name = _clean_name(identity.last_name)
        # Unusable password: nobody knows it; "forgot password" sets a real one.
        hashed_password = get_password_hash(secrets.token_urlsafe(32))
        token: Optional[str] = None
        token_hash: Optional[str] = None
        if not verified:
            token = create_verification_token()
            token_hash = hashlib.sha256(token.encode()).hexdigest()

        pool = self.db.require_pool()
        for username in _username_candidates(base):
            try:
                async with pool.acquire() as connection:
                    async with connection.transaction():
                        conn = cast(Connection, connection)
                        user = await self.user_repo.create_user(
                            first_name, last_name, username, email, hashed_password,
                            conn, is_validated=verified,
                        )
                        await self.oauth_repo.link(user["id"], provider.id, identity.provider_user_id, conn)
                        if token_hash is not None:
                            await self.token_repo.create_verification_token(
                                user["id"], token_hash, "email",
                                datetime.now(timezone.utc) + timedelta(days=1), conn,
                            )
            except asyncpg.UniqueViolationError as e:
                if e.constraint_name == "ix_users_username":
                    continue
                if e.constraint_name == "uq_oauth_accounts_provider_user":
                    return await self._linked_session(provider.id, identity.provider_user_id)
                if e.constraint_name == "ix_users_email":
                    raise OAuthFlowError("email_in_use") from None
                raise
            logger.info("OAuth: created user id=%s via %s", user["id"], provider.id)
            if token is not None:
                return OAuthResult(username=username, email_to=email, verification_token=token)
            return await self._session_for(user)
        logger.error("OAuth: no free username for a new %s account", provider.id)
        raise OAuthFlowError("server_error")
