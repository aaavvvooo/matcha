from application.database import Database
from typing import Optional
from asyncpg.connection import Connection

# Columns every user lookup returns. hashed_password only where a password is checked.
_USER_COLUMNS = "id, first_name, last_name, username, email, is_validated, token_version"


class UserRepository:
    def __init__(self, db: Database):
        self.db = db

    async def create_user(
        self,
        first_name,
        last_name,
        username,
        email,
        hashed_password,
        transaction: Optional[Connection] = None,
        is_validated: bool = False,
    ):
        query = """
            INSERT INTO users (first_name, last_name, username, email, hashed_password, is_validated)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, first_name, last_name, username, email, created_at, is_validated, token_version
        """
        args = (first_name, last_name, username, email, hashed_password, is_validated)
        if not transaction:
            user = await self.db.fetch_one(query, *args)
        else:
            user = await transaction.fetchrow(query, *args)
        return user

    # Email and username are unique ignoring case (uq_users_email_lower / uq_users_username_lower),
    # so every lookup compares lower() on both sides and finds at most one row.
    async def get_user_by_email(self, email: str):
        query = f"SELECT {_USER_COLUMNS}, hashed_password FROM users WHERE lower(email) = lower($1)"
        return await self.db.fetch_one(query, email)

    async def get_user_by_username(self, username: str):
        query = f"SELECT {_USER_COLUMNS}, hashed_password FROM users WHERE lower(username) = lower($1)"
        return await self.db.fetch_one(query, username)

    async def get_user_by_id(self, user_id: int, transaction: Optional[Connection] = None):
        """The session identity: tokens carry the immutable id, never the username."""
        query = f"SELECT {_USER_COLUMNS} FROM users WHERE id = $1"
        if transaction is None:
            return await self.db.fetch_one(query, user_id)
        return await transaction.fetchrow(query, user_id)

    async def user_exists(self, user_id: int) -> bool:
        return await self.db.fetch_val("SELECT 1 FROM users WHERE id = $1", user_id) is not None

    async def email_taken_by_other(
        self, email: str, user_id: int, transaction: Optional[Connection] = None
    ) -> bool:
        query = "SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2"
        if transaction is None:
            return await self.db.fetch_val(query, email, user_id) is not None
        return await transaction.fetchval(query, email, user_id) is not None

    async def lock_user(self, user_id: int, transaction: Connection) -> bool:
        """Row lock serialising per-account actions (email cooldowns, email change)."""
        row = await transaction.fetchval("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", user_id)
        return row is not None

    async def bump_token_version(self, user_id: int, transaction: Connection) -> None:
        """Ends every outstanding access/refresh token of the user (they carry the old version)."""
        await transaction.execute(
            "UPDATE users SET token_version = token_version + 1 WHERE id = $1", user_id
        )

    # Column names can't be bound as parameters, so only these may be interpolated.
    UPDATABLE_COLUMNS = frozenset(
        {"first_name", "last_name", "username", "email", "is_validated", "hashed_password"}
    )

    async def update_user(
        self, user_id: int, data: dict, transaction: Optional[Connection] = None
    ):
        unknown = set(data) - self.UPDATABLE_COLUMNS
        if unknown or not data:
            raise ValueError(f"update_user: invalid columns {sorted(unknown)}")
        set_clauses = [f"{column} = ${i + 2}" for i, column in enumerate(data.keys())]
        set_clause = ", ".join(set_clauses)
        query = f"""
            UPDATE users
            SET {set_clause}
            WHERE id = $1
            RETURNING id, first_name, last_name, username, email, created_at, is_validated, token_version
        """
        if not transaction:
            user = await self.db.fetch_one(query, user_id, *data.values())
        else:
            user = await transaction.fetchrow(query, user_id, *data.values())
        return user

    # ── presence (websocket/manager.py) ────────────────────────────────────
    async def set_online(self, user_id: int) -> None:
        await self.db.execute("UPDATE users SET is_online = true WHERE id = $1", user_id)

    async def set_offline(self, user_id: int) -> None:
        await self.db.execute(
            "UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1", user_id
        )

    async def reset_online_flags(self) -> None:
        """Startup: no socket survives a restart, so nobody is online."""
        await self.db.execute("UPDATE users SET is_online = false WHERE is_online = true")
