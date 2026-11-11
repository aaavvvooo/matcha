"""Hand-rolled OAuth 2.0 authorization-code client for 42 Intra and GitHub (bonus B1).

No OAuth / account library: plain httpx. Rules:
- Endpoint URLs are fixed here; the redirect_uri is built from server config only.
- Short timeouts, redirects never followed, provider bodies never logged or
  returned (they can carry codes and tokens). Failures raise ProviderError,
  which carries no provider text.
- The provider access token lives only inside fetch_identity() and is dropped.
"""

import logging
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from application.config import (
    FRONTEND_URL,
    OAUTH_42_CLIENT_ID,
    OAUTH_42_CLIENT_SECRET,
    OAUTH_GITHUB_CLIENT_ID,
    OAUTH_GITHUB_CLIENT_SECRET,
    OAUTH_REDIRECT_BASE_URL,
)

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_MAX_ID_LEN = 64  # oauth_accounts.provider_user_id VARCHAR(64)

# Tests swap this for an httpx.MockTransport; None means the real network.
transport: Optional[httpx.AsyncBaseTransport] = None


class ProviderError(Exception):
    """The provider refused or returned something unusable. Message is a fixed tag."""


@dataclass(frozen=True)
class ProviderConfig:
    id: str
    label: str
    authorize_url: str
    token_url: str
    scope: str
    pkce: bool
    # May an address the provider doesn't mark verified start a new (unvalidated)
    # account? Only for 42, whose addresses are school-assigned.
    unverified_signup: bool
    client_id: Optional[str]
    client_secret: Optional[str]

    @property
    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret and OAUTH_REDIRECT_BASE_URL and FRONTEND_URL)

    @property
    def redirect_uri(self) -> str:
        base = (OAUTH_REDIRECT_BASE_URL or "").rstrip("/")
        return f"{base}/auth/oauth/{self.id}/callback"


@dataclass(frozen=True)
class ProviderIdentity:
    provider_user_id: str
    login: str
    email: Optional[str]
    email_verified: bool
    first_name: str
    last_name: str


# Fixed allowlist. 42's public docs (api.intra.42.fr/apidoc, behind sign-in) don't
# document PKCE, so 42 runs without it: it is a confidential client (secret sent
# only server-to-server) and `state` still binds the callback to the browser.
PROVIDERS: dict[str, ProviderConfig] = {
    "42": ProviderConfig(
        id="42",
        label="42 Intra",
        authorize_url="https://api.intra.42.fr/oauth/authorize",
        token_url="https://api.intra.42.fr/oauth/token",
        scope="public",
        pkce=False,
        unverified_signup=True,
        client_id=OAUTH_42_CLIENT_ID,
        client_secret=OAUTH_42_CLIENT_SECRET,
    ),
    "github": ProviderConfig(
        id="github",
        label="GitHub",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",
        scope="read:user user:email",
        pkce=True,  # GitHub supports S256 only
        unverified_signup=False,
        client_id=OAUTH_GITHUB_CLIENT_ID,
        client_secret=OAUTH_GITHUB_CLIENT_SECRET,
    ),
}

_42_ME_URL = "https://api.intra.42.fr/v2/me"
_GITHUB_USER_URL = "https://api.github.com/user"
_GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
_GITHUB_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def enabled_providers() -> list[str]:
    return [p.id for p in PROVIDERS.values() if p.enabled]


def authorization_url(provider: ProviderConfig, state: str, code_challenge: Optional[str]) -> str:
    params = {
        "client_id": provider.client_id or "",
        "redirect_uri": provider.redirect_uri,
        "response_type": "code",
        "scope": provider.scope,
        "state": state,
    }
    if provider.pkce and code_challenge:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
    return f"{provider.authorize_url}?{urlencode(params)}"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False, transport=transport)


async def _json(client: httpx.AsyncClient, method: str, url: str, tag: str, **kwargs: Any) -> Any:
    try:
        resp = await client.request(method, url, **kwargs)
    except httpx.HTTPError as e:
        logger.warning("OAuth %s request failed: %s", tag, type(e).__name__)
        raise ProviderError(tag) from None
    if resp.status_code != 200:
        logger.warning("OAuth %s returned HTTP %d", tag, resp.status_code)
        raise ProviderError(tag)
    try:
        return resp.json()
    except ValueError:
        logger.warning("OAuth %s returned a non-JSON body", tag)
        raise ProviderError(tag) from None


async def _exchange_code(
    client: httpx.AsyncClient, provider: ProviderConfig, code: str, code_verifier: Optional[str]
) -> str:
    form = {
        "grant_type": "authorization_code",
        "client_id": provider.client_id or "",
        "client_secret": provider.client_secret or "",
        "code": code,
        "redirect_uri": provider.redirect_uri,
    }
    if provider.pkce and code_verifier:
        form["code_verifier"] = code_verifier
    data = await _json(
        client, "POST", provider.token_url, f"{provider.id}.token",
        data=form, headers={"Accept": "application/json"},
    )
    # GitHub reports errors as HTTP 200 + {"error": ...}; only the error tag is logged.
    token = data.get("access_token") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token:
        err = data.get("error") if isinstance(data, dict) else None
        logger.warning(
            "OAuth %s token exchange refused: error=%s",
            provider.id, err if isinstance(err, str) and err.isidentifier() else "?",
        )
        raise ProviderError(f"{provider.id}.token")
    return token


def _provider_user_id(raw: Any) -> str:
    # bool is an int subclass; reject it explicitly.
    if isinstance(raw, bool) or not isinstance(raw, (int, str)):
        raise ProviderError("identity")
    value = str(raw).strip()
    if not value or len(value) > _MAX_ID_LEN:
        raise ProviderError("identity")
    return value


def _str(raw: Any) -> str:
    return raw.strip() if isinstance(raw, str) else ""


async def _fetch_42(client: httpx.AsyncClient, token: str) -> ProviderIdentity:
    me = await _json(client, "GET", _42_ME_URL, "42.me", headers={"Authorization": f"Bearer {token}"})
    if not isinstance(me, dict):
        raise ProviderError("42.me")
    return ProviderIdentity(
        provider_user_id=_provider_user_id(me.get("id")),
        login=_str(me.get("login")),
        # 42 exposes no "verified" flag. The address is assigned by 42 (the
        # student can't pick someone else's), but it is still never used to link
        # to an existing account; a new account must confirm it through our own
        # verification email before the 42 link can sign anyone in.
        email=_str(me.get("email")) or None,
        email_verified=False,
        first_name=_str(me.get("usual_first_name")) or _str(me.get("first_name")),
        last_name=_str(me.get("last_name")),
    )


async def _fetch_github(client: httpx.AsyncClient, token: str) -> ProviderIdentity:
    headers = {**_GITHUB_HEADERS, "Authorization": f"Bearer {token}"}
    user = await _json(client, "GET", _GITHUB_USER_URL, "github.user", headers=headers)
    if not isinstance(user, dict):
        raise ProviderError("github.user")
    emails = await _json(client, "GET", _GITHUB_EMAILS_URL, "github.emails", headers=headers)
    # Only a verified primary address is used. An unverified one is dropped
    # entirely (-> no_email): creating an account for it would let whoever
    # typed it into GitHub pre-register someone else's address with a link
    # that survives the real owner's later password reset.
    email: Optional[str] = None
    if isinstance(emails, list):
        for entry in emails:
            if isinstance(entry, dict) and entry.get("primary") is True:
                if entry.get("verified") is True:
                    email = _str(entry.get("email")) or None
                break
    name = _str(user.get("name"))
    first, _, last = name.partition(" ")
    return ProviderIdentity(
        provider_user_id=_provider_user_id(user.get("id")),
        login=_str(user.get("login")),
        email=email,
        email_verified=email is not None,
        first_name=first.strip(),
        last_name=last.strip(),
    )


async def fetch_identity(
    provider: ProviderConfig, code: str, code_verifier: Optional[str]
) -> ProviderIdentity:
    """Exchange the code, read the profile, and forget the provider token."""
    async with _client() as client:
        token = await _exchange_code(client, provider, code, code_verifier)
        if provider.id == "42":
            return await _fetch_42(client, token)
        return await _fetch_github(client, token)
