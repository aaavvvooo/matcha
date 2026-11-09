"""Turn expected asyncpg integrity errors into safe HTTP errors.

Pre-checks (e.g. "is this email taken?") race with concurrent requests, so the
database constraint is the real guard. Without this mapping a lost race reaches
the generic 500 handler instead of a 409/400 the client can act on.
"""

from contextlib import contextmanager
from typing import Iterator, Mapping

import asyncpg
from fastapi import HTTPException, status

# Unique index name -> client-facing message (names from the Alembic migrations).
UNIQUE_MESSAGES: Mapping[str, str] = {
    "ix_users_email": "Email already registered",
    "ix_users_username": "Username already taken",
    "ix_user_profiles_user_id": "Profile already exists",
}


@contextmanager
def map_integrity_errors(
    conflict_detail: str = "Already exists",
    fk_detail: str = "Referenced item does not exist",
) -> Iterator[None]:
    try:
        yield
    except asyncpg.UniqueViolationError as e:
        detail = UNIQUE_MESSAGES.get(e.constraint_name or "", conflict_detail)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from None
    except asyncpg.ForeignKeyViolationError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=fk_detail) from None
