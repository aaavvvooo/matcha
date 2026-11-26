"""Tests run against a throwaway PostgreSQL database (TEST_DB), created from the migrations.

Needs the Compose database running: `docker compose up -d postgres`, then `uv run pytest`.
"""
import os
import subprocess
import sys
from pathlib import Path

import asyncpg
import pytest
from dotenv import dotenv_values

BACKEND = Path(__file__).resolve().parent.parent
TEST_DB = "matcha_test"

# Set before any application module reads its configuration. The credentials are the local
# stack's; the database never is, and nothing can reach the mail provider.
for _name, _value in dotenv_values(BACKEND.parent / ".env").items():
    if _value is not None:
        os.environ.setdefault(_name, _value)
os.environ.update(POSTGRES_DB=TEST_DB, POSTGRES_HOST="localhost", BREVO_API_KEY="")
# Alembic prefers DATABASE_URL over POSTGRES_DB: left in place it would migrate the real database.
os.environ.pop("DATABASE_URL", None)
os.environ.setdefault("POSTGRES_PORT_INNER", "5432")
sys.path.insert(0, str(BACKEND))

from application.database import Database  # noqa: E402


async def _admin(statement: str) -> None:
    connection = await asyncpg.connect(
        user=os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"],
        host=os.environ["POSTGRES_HOST"], port=int(os.environ["POSTGRES_PORT_INNER"]), database="postgres",
    )
    try:
        await connection.execute(statement)
    finally:
        await connection.close()


@pytest.fixture(scope="session", autouse=True)
def _database():
    import asyncio

    asyncio.run(_admin(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)"))
    asyncio.run(_admin(f"CREATE DATABASE {TEST_DB}"))
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND, check=True, capture_output=True)
    yield
    asyncio.run(_admin(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)"))


@pytest.fixture
async def db():
    database = Database()
    await database.connect()
    assert await database.fetch_val("SELECT current_database()") == TEST_DB
    await database.execute("TRUNCATE users, tags RESTART IDENTITY CASCADE")
    yield database
    await database.disconnect()


@pytest.fixture
def make_user(db):
    async def _make(name: str) -> int:
        """A validated user with a complete profile and a main photo."""
        user_id = await db.fetch_val(
            """
            INSERT INTO users (first_name, last_name, username, email, hashed_password, is_validated)
            VALUES ($1, 'Test', $2, $3, 'x', TRUE) RETURNING id
            """,
            name, name, f"{name}@example.org",
        )
        await db.execute("INSERT INTO user_profiles (user_id, gender, fame_rating) VALUES ($1, 'Woman', 0)", user_id)
        await db.execute(
            'INSERT INTO photos (user_id, url, "order", is_main) VALUES ($1, $2, 1, TRUE)', user_id, f"{name}.jpg"
        )
        return user_id

    return _make
