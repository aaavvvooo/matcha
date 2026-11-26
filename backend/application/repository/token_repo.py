from datetime import datetime
from asyncpg.connection import Connection
from application.database import Database
from typing import Optional, cast


class TokenRepository:
    def __init__(self, db: Database):
        self.db = db

    async def create_verification_token(
        self,
        user_id: int,
        token: str,
        token_type: str,
        expires_at: datetime,
        transaction: Optional[Connection] = None,
        new_email: Optional[str] = None,
    ):
        """token is the SHA-256 of the emailed secret. token_type is "email" (sign-up verification
        or, with new_email, a pending email change) or "password_reset"."""
        query = """
            INSERT INTO verification_tokens (user_id, token, token_type, expires_at, new_email)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, token, token_type, created_at, expires_at, used, new_email
        """
        args = (user_id, token, token_type, expires_at, new_email)
        if not transaction:
            return await self.db.fetch_one(query, *args)
        return await transaction.fetchrow(query, *args)

    async def get_verification_token(self, token: str, token_type: str):
        """Only a token of the expected type: a reset token never verifies an email and vice versa."""
        query = """
            SELECT id, user_id, token, token_type, created_at, expires_at, used, new_email
            FROM verification_tokens
            WHERE token = $1 AND token_type = $2
        """
        return await self.db.fetch_one(query, token, token_type)

    async def consume_token(self, token_id: int, transaction: Connection) -> bool:
        """Marks a live token used; False if it was already used or has expired (so two
        concurrent requests can't both spend it)."""
        row = await transaction.fetchval(
            """
            UPDATE verification_tokens
            SET used = TRUE
            WHERE id = $1 AND used = FALSE AND expires_at > NOW()
            RETURNING id
            """,
            token_id,
        )
        return row is not None

    async def invalidate_user_tokens(
        self, user_id: int, token_type: Optional[str], transaction: Connection
    ) -> None:
        """Marks every outstanding token of the user (of one type, or all types) used."""
        if token_type is None:
            await transaction.execute(
                "UPDATE verification_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
                user_id,
            )
        else:
            await transaction.execute(
                """
                UPDATE verification_tokens SET used = TRUE
                WHERE user_id = $1 AND token_type = $2 AND used = FALSE
                """,
                user_id, token_type,
            )

    async def count_recent_tokens(
        self,
        user_id: int,
        token_type: str,
        seconds: int,
        email_change_only: bool,
        transaction: Connection,
    ) -> int:
        """Tokens of this type issued to the user in the last `seconds` (mail cooldowns)."""
        return await transaction.fetchval(
            """
            SELECT count(*) FROM verification_tokens
            WHERE user_id = $1 AND token_type = $2
              AND created_at > NOW() - make_interval(secs => $3)
              AND ($4 = FALSE OR new_email IS NOT NULL)
            """,
            user_id, token_type, float(seconds), email_change_only,
        )

    async def get_pending_email(self, user_id: int) -> Optional[str]:
        """The address of the user's live, unconfirmed email change, if any."""
        return await self.db.fetch_val(
            """
            SELECT new_email FROM verification_tokens
            WHERE user_id = $1 AND token_type = 'email' AND new_email IS NOT NULL
              AND used = FALSE AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
            """,
            user_id,
        )

    # --- Refresh tokens: one session per signed-in device, keyed by the immutable user id ---
    # Everything that adds or ends sessions locks the user's row first, so a refresh can't slip a
    # new token past a logout or a password reset (which updates that row) happening meanwhile.

    async def _lock_user(self, user_id: int, connection: Connection) -> None:
        await connection.execute("SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE", user_id)

    async def create_session(
        self, user_id: int, token_hash: str, expires_at: datetime, max_sessions: int
    ) -> None:
        """A new session; beyond max_sessions the ones idle the longest end."""
        async with self.db.require_pool().acquire() as connection:
            async with connection.transaction():
                await self._lock_user(user_id, cast(Connection, connection))
                await connection.execute(
                    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
                    user_id, token_hash, expires_at,
                )
                await connection.execute(
                    """
                    DELETE FROM refresh_tokens WHERE user_id = $1 AND session_id NOT IN (
                        SELECT session_id FROM refresh_tokens WHERE user_id = $1
                        GROUP BY session_id ORDER BY max(id) DESC LIMIT $2)
                    """,
                    user_id, max_sessions,
                )

    async def rotate_refresh_token(
        self, user_id: int, token_version: int, old_hash: str, new_hash: str, expires_at: datetime,
        grace_seconds: int, max_tokens: int,
    ) -> bool:
        """Replaces a live token with a new one of the same session; False if it isn't live or the
        account's token version has moved on.

        The old one stays valid for grace_seconds (from its first use: LEAST), so tabs sharing the
        cookie can't invalidate each other. At most max_tokens of a session are kept.
        """
        async with self.db.require_pool().acquire() as connection:
            async with connection.transaction():
                await self._lock_user(user_id, cast(Connection, connection))
                session_id = await connection.fetchval(
                    """
                    UPDATE refresh_tokens
                    SET expires_at = LEAST(expires_at, now() + make_interval(secs => $3))
                    WHERE token_hash = $2 AND user_id = $1 AND expires_at > now()
                      AND EXISTS (SELECT 1 FROM users WHERE id = $1 AND token_version = $4)
                    RETURNING session_id
                    """,
                    user_id, old_hash, grace_seconds, token_version,
                )
                if session_id is None:
                    return False
                await connection.execute(
                    """
                    INSERT INTO refresh_tokens (user_id, session_id, token_hash, expires_at)
                    VALUES ($1, $2, $3, $4)
                    """,
                    user_id, session_id, new_hash, expires_at,
                )
                await connection.execute(
                    """
                    DELETE FROM refresh_tokens WHERE session_id = $1 AND id NOT IN (
                        SELECT id FROM refresh_tokens WHERE session_id = $1 ORDER BY id DESC LIMIT $2)
                    """,
                    session_id, max_tokens,
                )
                return True

    async def delete_session(self, user_id: int, token_hash: str) -> None:
        """Ends the session the token belongs to, if it is one of the user's."""
        async with self.db.require_pool().acquire() as connection:
            async with connection.transaction():
                await self._lock_user(user_id, cast(Connection, connection))
                await connection.execute(
                    """
                    DELETE FROM refresh_tokens WHERE user_id = $1 AND session_id = (
                        SELECT session_id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2)
                    """,
                    user_id, token_hash,
                )

    async def delete_all_sessions(self, user_id: int, transaction: Optional[Connection] = None):
        if transaction is not None:
            await self._lock_user(user_id, transaction)
            await transaction.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)
            return
        async with self.db.require_pool().acquire() as connection:
            async with connection.transaction():
                await self.delete_all_sessions(user_id, cast(Connection, connection))

    # --- Token blacklist ---

    async def blacklist_token(self, token_hash: str, expires_at: datetime):
        query = """
            INSERT INTO token_blacklist (token_hash, expires_at)
            VALUES ($1, $2)
            ON CONFLICT (token_hash) DO NOTHING
        """
        await self.db.execute(query, token_hash, expires_at)

    async def is_token_blacklisted(self, token_hash: str) -> bool:
        query = "SELECT 1 FROM token_blacklist WHERE token_hash = $1 AND expires_at > NOW()"
        result = await self.db.fetch_val(query, token_hash)
        return result is not None

    async def cleanup_expired_tokens(self) -> None:
        await self.db.execute("DELETE FROM token_blacklist WHERE expires_at <= NOW()")
        await self.db.execute("DELETE FROM refresh_tokens WHERE expires_at <= NOW()")
