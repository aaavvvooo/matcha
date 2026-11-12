import re
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from ..config import JWT_SECRET_KEY, JWT_ALGORITHM


ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 60


def _get_jwt_settings() -> tuple[str, str]:
    if JWT_SECRET_KEY is None or JWT_ALGORITHM is None:
        raise RuntimeError("JWT_SECRET_KEY and JWT_ALGORITHM must be set")
    return JWT_SECRET_KEY, JWT_ALGORITHM


_USER_ID_RE = re.compile(r"[1-9][0-9]{0,9}")
_INT4_MAX = 2_147_483_647


def session_claims(user_id: int, token_version: int) -> dict:
    """JWT identity: the immutable user id (never the username) plus the user's token version,
    which a password reset bumps to end every outstanding session."""
    return {"sub": str(user_id), "ver": token_version}


def parse_session_claims(payload: dict) -> tuple[int, int] | None:
    """(user_id, token_version) from a decoded JWT, or None for anything else, including
    tokens minted before ids were used (sub=<username>, no "ver"): those must never resolve."""
    sub = payload.get("sub")
    ver = payload.get("ver")
    if not isinstance(sub, str) or not _USER_ID_RE.fullmatch(sub):
        return None
    if not isinstance(ver, int) or isinstance(ver, bool) or ver < 0:
        return None
    user_id = int(sub)
    if user_id > _INT4_MAX:
        return None
    return user_id, ver


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    secret, algorithm = _get_jwt_settings()
    encoded_jwt = jwt.encode(to_encode, secret, algorithm=algorithm)
    return encoded_jwt


def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    secret, algorithm = _get_jwt_settings()
    encoded_jwt = jwt.encode(to_encode, secret, algorithm=algorithm)
    return encoded_jwt


def decode_token(token: str):
    try:
        secret, algorithm = _get_jwt_settings()
        payload = jwt.decode(token, secret, algorithms=[algorithm])
        return payload
    except ExpiredSignatureError:
        return None
    except JWTError:
        return None


def create_verification_token() -> str:
    return secrets.token_urlsafe(32)


async def create_password_reset_token() -> dict:
    reset_token = secrets.token_urlsafe(32)
    hashed_token = hashlib.sha256(reset_token.encode()).hexdigest()
    expiry = datetime.now(timezone.utc) + timedelta(
        minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    )
    return {"hashed_token": hashed_token, "token": reset_token, "expiry": expiry}
