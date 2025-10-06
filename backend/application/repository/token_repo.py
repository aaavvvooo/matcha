from datetime import timedelta
from asyncpg.connection import Connection
from application.database import Database
from typing import Optional



class TokenRepository:
    def __init__(self, db: Database):
        self.db = db

    async def create_verification_token(self, user_id: int, token: str, token_type: str, expires_at: timedelta, transaction: Optional[Connection] = None):
        query = """
            INSERT INTO verification_tokens (user_id, token, token_type, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id, user_id, token, token_type, created_at, expires_at, used
        """
        try:
            if not transaction:
                token = await self.db.fetch_one(query, user_id, token, token_type, expires_at)
            else:
                token = await transaction.fetchrow(query, user_id, token, token_type, expires_at)
            return token
        except Exception as e:
            print(e)
            raise e





    async def get_verification_token(self, token: str, token_type: str):
        query = """
            SELECT id, user_id, token, token_type, created_at, expires_at, used
            FROM verification_tokens
            WHERE token = $1 AND token_type = $2 AND used = FALSE AND expires_at > NOW()
        """
        return await self.db.fetch_one(query, token, token_type)

    async def mark_token_as_used(self, token_id: int):
        query = """
            UPDATE verification_tokens
            SET used = TRUE, updated_at = NOW()
            WHERE id = $1
            RETURNING id, used, updated_at
        """
        return await self.db.fetch_one(query, token_id)