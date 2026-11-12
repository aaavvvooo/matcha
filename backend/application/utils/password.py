import zxcvbn
import re
from passlib.context import CryptContext
from fastapi import HTTPException, status


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def get_password_hash(password):
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    verified = pwd_context.verify(plain_password, hashed_password)
    return verified


def validate_password(password: str):
    result = zxcvbn.zxcvbn(password)
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long",
        )
    if result["score"] < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is not strong enough",
        )

    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter",
        )

    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one lowercase letter",
        )

    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one special character",
        )

    if not re.search(r"[0-9]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number",
        )


_dummy_hash: str | None = None


def burn_password_check(plain_password: str) -> None:
    """Spend the same Argon2 work as a real check when the account doesn't exist, so login
    timing doesn't tell whether a username/email is registered."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = pwd_context.hash("dummy-password-for-timing-equalisation")
    pwd_context.verify(plain_password, _dummy_hash)
