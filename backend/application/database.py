import asyncpg
from typing import Optional, AsyncGenerator
from sqlalchemy.ext.declarative import declarative_base
from .config import POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT_INNER

Base = declarative_base()

DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT_INNER}/{POSTGRES_DB}"


class Database:
    """Database connection manager using asyncpg"""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
    
    def require_pool(self) -> asyncpg.Pool:
        if self.pool is None:
            raise RuntimeError("Database pool not initialized")
        return self.pool

    async def connect(self):
        """Create connection pool on startup"""
        if not self.pool:
            self.pool = await asyncpg.create_pool(
                DATABASE_URL,
                min_size=5,
                max_size=20,
                command_timeout=60,
                server_settings={
                    'application_name': 'matcha_backend'
                }
            )

    async def disconnect(self):
        """Close connection pool on shutdown"""
        if self.pool:
            await self.pool.close()
            self.pool = None

    async def fetch_one(self, query: str, *args):
        """Fetch a single row"""
        pool = self.require_pool()
        async with pool.acquire() as connection:
            return await connection.fetchrow(query, *args)

    async def fetch_all(self, query: str, *args):
        """Fetch multiple rows"""
        pool = self.require_pool()
        async with pool.acquire() as connection:
            return await connection.fetch(query, *args)

    async def fetch_val(self, query: str, *args):
        """Fetch a single value"""
        pool = self.require_pool()
        async with pool.acquire() as connection:
            return await connection.fetchval(query, *args)

    async def execute(self, query: str, *args):
        """Execute a query without returning results"""
        pool = self.require_pool()
        async with pool.acquire() as connection:
            return await connection.execute(query, *args)

    async def execute_many(self, query: str, args_list):
        """Execute query multiple times with different parameters"""
        pool = self.require_pool()
        async with pool.acquire() as connection:
            return await connection.executemany(query, args_list)


database = Database()


async def get_db() -> AsyncGenerator[Database, None]:
    """Dependency for FastAPI routes"""
    yield database


async def get_connection():
    """Get a raw connection from pool (for transactions)"""
    pool = database.require_pool()
    async with pool.acquire() as connection:
        yield connection
