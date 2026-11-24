import dotenv
import os
from urllib.parse import urlsplit

dotenv.load_dotenv("../.env")

POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_HOST = os.getenv("POSTGRES_HOST")
POSTGRES_PORT_INNER = os.getenv("POSTGRES_PORT_INNER")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")

REACT_APP_API_URL = os.getenv("REACT_APP_API_URL")
FROM_EMAIL = os.getenv("FROM_EMAIL")
BREVO_API_KEY = os.getenv("BREVO_API_KEY")


_DEFAULT_PORTS = {"http": 80, "https": 443}


def _frontend_origin(raw: str | None) -> tuple[str | None, str | None]:
    """(origin, problem) for FRONTEND_URL: the bare origin a browser sends in `Origin`
    (scheme://host[:port], lowercase host, no default port, no trailing slash), or a description
    of why the value was rejected. (None, None) when unset.

    Never raises: scripts import this module without needing a frontend. The app refuses to start
    on a problem (main.lifespan), since the value is the base of every emailed link (verify,
    reset), the OAuth return target and the only allowed CORS origin."""
    if not raw or not raw.strip():
        return None, None
    value = raw.strip()
    u = urlsplit(value)
    try:
        port = u.port  # urlsplit only validates the port when it is read
    except ValueError:
        return None, f"FRONTEND_URL={value!r} has an invalid port"
    if u.scheme not in _DEFAULT_PORTS or not u.hostname:
        return None, f"FRONTEND_URL={value!r} must start with http:// or https:// and name a host"
    if "@" in u.netloc or u.path not in ("", "/") or u.query or u.fragment:
        return None, f"FRONTEND_URL={value!r} must be a bare origin (no user, path, query or fragment)"
    host = f"[{u.hostname}]" if ":" in u.hostname else u.hostname  # IPv6 literals keep brackets
    if port is not None and port != _DEFAULT_PORTS[u.scheme]:
        host = f"{host}:{port}"
    return f"{u.scheme}://{host}", None


FRONTEND_URL, FRONTEND_URL_PROBLEM = _frontend_origin(os.getenv("FRONTEND_URL"))
# Emailed links (verify, reset, email change) need both the mail API and a frontend to point at.
EMAIL_CONFIGURED = bool(BREVO_API_KEY and FRONTEND_URL)

# OAuth sign-in (bonus B1). A provider is enabled only when its client id and
# secret are set, together with OAUTH_REDIRECT_BASE_URL (the backend's public
# base URL, e.g. http://localhost:8000) and FRONTEND_URL. The callback URL
# registered with each provider is {OAUTH_REDIRECT_BASE_URL}/auth/oauth/<id>/callback.
OAUTH_REDIRECT_BASE_URL = os.getenv("OAUTH_REDIRECT_BASE_URL")
OAUTH_42_CLIENT_ID = os.getenv("OAUTH_42_CLIENT_ID")
OAUTH_42_CLIENT_SECRET = os.getenv("OAUTH_42_CLIENT_SECRET")
OAUTH_GITHUB_CLIENT_ID = os.getenv("OAUTH_GITHUB_CLIENT_ID")
OAUTH_GITHUB_CLIENT_SECRET = os.getenv("OAUTH_GITHUB_CLIENT_SECRET")

# Cookies (session + OAuth flow) get the Secure flag when the API's public base URL is https.
# OAUTH_REDIRECT_BASE_URL is that URL when OAuth is configured; REACT_APP_API_URL otherwise.
SECURE_COOKIES = (OAUTH_REDIRECT_BASE_URL or REACT_APP_API_URL or "").strip().lower().startswith("https://")

# Voice / video calls (bonus B4). Served to signed-in users by GET /chat/ice-servers.
# STUN_URL defaults to a public STUN server; the TURN trio is optional and, when all three are
# set, adds a relay for peers that cannot connect directly. Values live in .env only.
STUN_URL = os.getenv("STUN_URL") or "stun:stun.l.google.com:19302"
TURN_URL = os.getenv("TURN_URL")
TURN_USERNAME = os.getenv("TURN_USERNAME")
TURN_CREDENTIAL = os.getenv("TURN_CREDENTIAL")
