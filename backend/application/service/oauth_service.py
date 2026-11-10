"""OAuth sign-in (bonus B1): state/PKCE bookkeeping and account linking.

Flow state is stateless: /start puts {provider, state, code_verifier, exp} in
the httpOnly `oauth_flow` cookie, authenticated with HMAC-SHA256 under a key
derived from the server secret. The callback verifies it (constant time, strict
parsing), compares `state` in constant time and always clears the cookie, so a
flow is single-use per browser; the provider's codes are single-use too. Works
across instances and needs no server memory.

Linking rules (never trust an address the provider does not mark verified):
  1. provider identity already linked          -> that user
  2. provider-verified email == validated user -> link + that user
     provider-verified email == unvalidated    -> refuse (link_unverified)
     unverified/absent email == existing user  -> refuse (email_in_use), no link
  3. otherwise create a user + link in one transaction. GitHub: only with a
     verified primary email (else no_email: no account, no link). 42: its
     school-assigned address has no verified flag, so the account starts
     unvalidated and gets a verification email; the link is inert (no session)
     until that mail is clicked.
"""

import base64
import binascii
import hashlib
import hmac
import json
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
from application.config import JWT_SECRET_KEY
from application.database import Database
from application.repository import TokenRepository, UserRepository
from application.repository.oauth_repo import OAuthRepository
from application.service.auth_service import AuthService
from application.utils import create_verification_token, get_password_hash

logger = logging.getLogger(__name__)

STATE_TTL_SECONDS = 600
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


def get_enabled_provider(provider_id: str) -> ProviderConfig:
    provider = PROVIDERS.get(provider_id)
    if provider is None or not provider.enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return provider


# --- stateless flow cookie ----------------------------------------------------
# value = b64url(json payload) "." b64url(HMAC-SHA256(flow_key, b64url payload))
# flow_key = HMAC-SHA256(JWT_SECRET_KEY, context label): a key of its own, so a
# flow MAC can never be confused with a JWT signature.

_FLOW_MAC_CONTEXT = b"matcha/oauth-flow-v1"
_MAX_FLOW_COOKIE_LEN = 1024
_CLOCK_SKEW_SECONDS = 5
_B64URL_RE = re.compile(r"[A-Za-z0-9_-]+")
_STATE_RE = re.compile(r"[A-Za-z0-9_-]{43}")      # secrets.token_urlsafe(32)
_VERIFIER_RE = re.compile(r"[A-Za-z0-9_-]{86}")   # secrets.token_urlsafe(64)
_FLOW_KEYS = frozenset({"p", "s", "v", "e"})


def _flow_key() -> bytes:
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY must be set")
    return hmac.new(JWT_SECRET_KEY.encode(), _FLOW_MAC_CONTEXT, hashlib.sha256).digest()


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    if not _B64URL_RE.fullmatch(text):
        raise ValueError("not base64url")
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(body: str) -> bytes:
    return hmac.new(_flow_key(), body.encode("ascii"), hashlib.sha256).digest()


def _seal(payload: dict) -> str:
    body = _b64e(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    return f"{body}.{_b64e(_mac(body))}"


def _unseal(cookie: Optional[str]) -> Optional[dict]:
    """The payload if the cookie is well-formed, authentic and unexpired, else None."""
    if not cookie or len(cookie) > _MAX_FLOW_COOKIE_LEN or cookie.count(".") != 1:
        return None
    body, mac = cookie.split(".")
    try:
        given_mac = _b64d(mac)
        raw = _b64d(body)
    except (ValueError, binascii.Error):
        return None
    if not hmac.compare_digest(_mac(body), given_mac):
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict) or set(data) != _FLOW_KEYS:
        return None
    provider, state, verifier, exp = data["p"], data["s"], data["v"], data["e"]
    now = int(time.time())
    if (
        not isinstance(provider, str) or provider not in PROVIDERS
        or not isinstance(state, str) or not _STATE_RE.fullmatch(state)
        or not (verifier is None or (isinstance(verifier, str) and _VERIFIER_RE.fullmatch(verifier)))
        or isinstance(exp, bool) or not isinstance(exp, int)
        or not now < exp <= now + STATE_TTL_SECONDS + _CLOCK_SKEW_SECONDS
    ):
        return None
    return data


def begin(provider: ProviderConfig) -> tuple[str, str]:
    """Returns (provider authorize URL, sealed flow cookie value). Nothing is kept
    server-side, so /start can't be used to exhaust server memory."""
    state = secrets.token_urlsafe(32)  # 256 bits
    verifier = challenge = None
    if provider.pkce:
        verifier = secrets.token_urlsafe(64)  # 86 chars, within RFC 7636's 43..128
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        challenge = _b64e(digest)
    cookie = _seal({
        "p": provider.id,
        "s": state,
        "v": verifier,
        "e": int(time.time()) + STATE_TTL_SECONDS,
    })
    return authorization_url(provider, state, challenge), cookie


def consume(cookie: Optional[str], provider_id: str, state: Optional[str]) -> Optional[str]:
    """Check the callback against the browser's flow cookie. Returns the PKCE
    verifier (or None). The caller always clears the cookie afterwards."""
    data = _unseal(cookie)
    if data is None or not state or len(state) > _MAX_STATE_LEN:
        raise OAuthFlowError("invalid_state")
    same_state = hmac.compare_digest(data["s"].encode(), state.encode())
    if not same_state or data["p"] != provider_id:
        raise OAuthFlowError("invalid_state")
    return data["v"]


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
        if not verified and not provider.unverified_signup:
            raise OAuthFlowError("no_email")  # defense in depth; the GitHub client already drops it
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
