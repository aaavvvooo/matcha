import hashlib
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, Request
from application.database import Database, get_db
from application.utils import decode_token
from application.repository.user_repo import UserRepository
from application.repository.token_repo import TokenRepository


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def _resolve_user(token: str, db: Database):
    user_repo = UserRepository(db)
    token_repo = TokenRepository(db)
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if await token_repo.is_token_blacklisted(token_hash):
        raise HTTPException(status_code=401, detail="Token has been revoked")

    username = payload.get("sub")
    if username is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = await user_repo.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
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
