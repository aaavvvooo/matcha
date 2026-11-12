import dotenv
import os

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


FRONTEND_URL = os.getenv("FRONTEND_URL")

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
