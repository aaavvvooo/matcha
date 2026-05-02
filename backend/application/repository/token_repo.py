from datetime import datetime
from asyncpg.connection import Connection
from application.database import Database
from typing import Optional


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
    ):
        query = """
            INSERT INTO verification_tokens (user_id, token, token_type, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id, user_id, token, token_type, created_at, expires_at, used
        """
        try:
            if not transaction:
                token_record = await self.db.fetch_one(
                    query, user_id, token, token_type, expires_at
                )
            else:
                token_record = await transaction.fetchrow(
                    query, user_id, token, token_type, expires_at
                )
            return token_record
        except Exception as e:
            print(e)
            raise e

    async def get_verification_token(self, token: str):
        query = """
            SELECT id, user_id, token, token_type, created_at, expires_at, used
            FROM verification_tokens
            WHERE token = $1 
        """
        return await self.db.fetch_one(query, token)

    async def mark_token_as_used(
        self, token_id: int, transaction: Optional[Connection] = None
    ):
        query = """
            UPDATE verification_tokens
            SET used = TRUE
            WHERE id = $1
            RETURNING id, used
        """
        try:
            if not transaction:
                return await self.db.fetch_one(query, token_id)
            else:
                return await transaction.fetchrow(query, token_id)
        except Exception as e:
            print(e)
            raise e

    # --- Refresh tokens ---

    async def upsert_refresh_token(self, username: str, token_hash: str, expires_at: datetime):
        query = """
            INSERT INTO refresh_tokens (username, token_hash, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (username) DO UPDATE
                SET token_hash = EXCLUDED.token_hash,
                    expires_at = EXCLUDED.expires_at
        """
        await self.db.execute(query, username, token_hash, expires_at)

    async def get_refresh_token(self, username: str):
        query = "SELECT token_hash FROM refresh_tokens WHERE username = $1 AND expires_at > NOW()"
        return await self.db.fetch_one(query, username)

    async def delete_refresh_token(self, username: str):
        query = "DELETE FROM refresh_tokens WHERE username = $1"
        await self.db.execute(query, username)

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
