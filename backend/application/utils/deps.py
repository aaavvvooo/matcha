from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException
from application.database import Database, get_db
from application.utils import decode_token
from application.repository.user_repo import UserRepository


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Database = Depends(get_db)
):
    user_repo = UserRepository(db)
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    username = payload.get("sub")

    if username is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = await user_repo.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"user": user, "token": token}
