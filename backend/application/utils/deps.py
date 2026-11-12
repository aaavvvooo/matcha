import hashlib
from typing import Any

from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, Request
from application.database import Database, get_db
from application.utils.tokens import decode_token, parse_session_claims
from application.repository.user_repo import UserRepository
from application.repository.token_repo import TokenRepository


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def resolve_access_token(token: str, db: Database) -> tuple[Any, dict] | None:
    """(user row, JWT payload) for a live access token, else None.

    Shared by REST (Bearer and the photo cookie) and the WebSocket (first frame and re-auth).
    The token must be an access JWT (a refresh JWT is signed with the same key), not
    blacklisted, carry an id-based subject plus the user's current token version (a password
    reset bumps it), and belong to a validated account.
    """
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    claims = parse_session_claims(payload)
    if claims is None:
        return None
    user_id, version = claims

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if await TokenRepository(db).is_token_blacklisted(token_hash):
        return None

    user = await UserRepository(db).get_user_by_id(user_id)
    if not user or not user["is_validated"] or user["token_version"] != version:
        return None
    return user, payload


async def _resolve_user(token: str, db: Database):
    resolved = await resolve_access_token(token, db)
    if resolved is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user, _payload = resolved
    return {"user": user, "token": token}


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Database = Depends(get_db)
):
    return await _resolve_user(token, db)


async def get_current_user_from_cookie(
    request: Request, db: Database = Depends(get_db)
):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await _resolve_user(token, db)


async def require_profile(
    current_user: dict = Depends(get_current_user), db: Database = Depends(get_db)
):
    from application.repository.profile_repo import ProfileRepository

    profile_repo = ProfileRepository(db)
    profile = await profile_repo.get_profile(current_user["user"]["id"])
    if profile is None or profile.get("gender") is None:
        raise HTTPException(
            status_code=403,
            detail="Complete your profile setup to access this feature",
        )
    return current_user
