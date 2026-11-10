"""OAuth sign-in routes (bonus B1), mounted under /auth/oauth.

The callback always answers with a 302 to the fixed frontend page
{FRONTEND_URL}/oauth/callback carrying only `status=ok|verify_email` or `error=<code>` from
oauth_service.ERROR_CODES. Tokens never appear in a URL: a successful sign-in
sets the same refresh/access cookies as POST /auth/login, and the SPA then
obtains the access token through POST /auth/refresh like on any page load.
"""

import logging
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import RedirectResponse

from application.api.endpoints.auth import (
    _get_email_client,
    _send_with_retry,
    set_session_cookies,
)
from application.clients import oauth_client
from application.config import BREVO_API_KEY, FRONTEND_URL, OAUTH_REDIRECT_BASE_URL
from application.database import Database, get_db
from application.limiter import limiter
from application.service import oauth_service
from application.service.oauth_service import OAuthFlowError, OAuthService

logger = logging.getLogger(__name__)

router = APIRouter()

_FLOW_COOKIE = "oauth_flow"
_FLOW_COOKIE_PATH = "/auth/oauth"
_MAX_CODE_LEN = 512
_SECURE_COOKIE = (OAUTH_REDIRECT_BASE_URL or "").lower().startswith("https://")


def _frontend_redirect(**params: str) -> RedirectResponse:
    base = (FRONTEND_URL or "").rstrip("/")
    response = RedirectResponse(f"{base}/oauth/callback?{urlencode(params)}", status_code=302)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    # Single use: the flow cookie is cleared on every callback outcome.
    response.delete_cookie(
        _FLOW_COOKIE, path=_FLOW_COOKIE_PATH, httponly=True, samesite="lax", secure=_SECURE_COOKIE
    )
    return response


@router.get("/providers")
async def list_providers():
    """Providers with credentials configured; the frontend shows only these."""
    return {"providers": oauth_client.enabled_providers()}


@router.get("/{provider}/start")
@limiter.limit("20/minute")
async def start(request: Request, provider: str):
    config = oauth_service.get_enabled_provider(provider)  # 404 unless allowlisted + configured
    # A restarted flow overwrites the previous cookie in this browser.
    url, flow_cookie = oauth_service.begin(config)
    response = RedirectResponse(url, status_code=302)
    response.headers["Cache-Control"] = "no-store"
    # SameSite=Lax (not Strict): the callback is a cross-site top-level GET from
    # the provider, and Lax cookies are sent on exactly that.
    response.set_cookie(
        key=_FLOW_COOKIE,
        value=flow_cookie,
        max_age=oauth_service.STATE_TTL_SECONDS,
        path=_FLOW_COOKIE_PATH,
        httponly=True,
        secure=_SECURE_COOKIE,
        samesite="lax",
    )
    return response


@router.get("/{provider}/callback")
@limiter.limit("20/minute")
async def callback(
    request: Request,
    provider: str,
    background_tasks: BackgroundTasks,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Database = Depends(get_db),
):
    config = oauth_service.get_enabled_provider(provider)
    flow_cookie = request.cookies.get(_FLOW_COOKIE)
    try:
        # State first, so even a provider error can't be replayed against a live flow.
        code_verifier = oauth_service.consume(flow_cookie, config.id, state)
        if error is not None:
            # The provider's error text is never echoed; cancellation is the usual case.
            raise OAuthFlowError("access_denied")
        if not code or len(code) > _MAX_CODE_LEN:
            raise OAuthFlowError("provider_error")
        try:
            identity = await oauth_client.fetch_identity(config, code, code_verifier)
        except oauth_client.ProviderError:
            raise OAuthFlowError("provider_error") from None

        email_available = bool(BREVO_API_KEY)
        result = await OAuthService(db).sign_in(config, identity, email_available)
    except OAuthFlowError as e:
        return _frontend_redirect(error=e.code)
    except Exception as e:
        # No exception text: asyncpg messages can echo row data (emails).
        logger.error(
            "OAuth callback failed for %s: %s sqlstate=%s",
            config.id, type(e).__name__, getattr(e, "sqlstate", None),
        )
        return _frontend_redirect(error="server_error")

    if result.verification_token is not None and result.email_to is not None:
        email_client = _get_email_client()  # configured: checked before the account was created
        background_tasks.add_task(
            _send_with_retry,
            email_client.send_verification_email,
            result.email_to,
            result.username,
            result.verification_token,
        )
        return _frontend_redirect(status="verify_email")

    if result.access_token is None or result.refresh_token is None:
        return _frontend_redirect(error="server_error")
    response = _frontend_redirect(status="ok")
    set_session_cookies(response, result.access_token, result.refresh_token)
    return response
