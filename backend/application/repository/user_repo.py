from application.database import Database
from typing import Optional
from asyncpg.connection import Connection


class UserRepository:
    def __init__(self, db: Database):
        self.db = db

    async def create_user(self, full_name, username, email, hashed_password, transaction: Optional[Connection]=None):
        query = """
            INSERT INTO users (full_name, username, email, hashed_password)
            VALUES ($1, $2, $3, $4)
            RETURNING id, full_name, username, email, created_at
        """
        try:
            if not transaction:
                user = await self.db.execute(query, full_name, username, email, hashed_password)
            else:
                user = await transaction.fetchrow(query, full_name, username, email, hashed_password)
            return user
        except Exception as e:
            print(e)
            raise e

    async def get_user_by_email(self, email: str):
        query = "SELECT id, full_name, username, email, hashed_password FROM users WHERE email = $1"
        user = await self.db.fetch_one(query, email)
        return user

    async def get_user_by_username(self, username: str):
        query = "SELECT id, full_name, username, email, hashed_password FROM users WHERE username = $1"
        user = await self.db.fetch_one(query, username)
        return user
