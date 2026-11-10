from typing import Optional

from asyncpg.connection import Connection

from application.database import Database


class OAuthRepository:
    def __init__(self, db: Database):
        self.db = db

    async def get_linked_user(self, provider: str, provider_user_id: str):
        query = """
            SELECT u.id, u.username, u.email, u.is_validated
            FROM oauth_accounts o
            JOIN users u ON u.id = o.user_id
            WHERE o.provider = $1 AND o.provider_user_id = $2
        """
        return await self.db.fetch_one(query, provider, provider_user_id)

    async def find_users_by_email(self, email: str):
        """Case-insensitive match. users.email is unique only case-sensitively, so
        more than one row can come back; callers must treat that as ambiguous."""
        query = """
            SELECT id, username, email, is_validated
            FROM users
            WHERE lower(email) = lower($1)
            ORDER BY id
            LIMIT 2
        """
        return await self.db.fetch_all(query, email)

    async def link(
        self,
        user_id: int,
        provider: str,
        provider_user_id: str,
        transaction: Optional[Connection] = None,
    ) -> None:
        query = """
            INSERT INTO oauth_accounts (user_id, provider, provider_user_id)
            VALUES ($1, $2, $3)
        """
        if transaction is None:
            await self.db.execute(query, user_id, provider, provider_user_id)
        else:
            await transaction.execute(query, user_id, provider, provider_user_id)
