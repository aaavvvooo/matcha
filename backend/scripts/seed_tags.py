"""Seed the reusable interest tags (#vegan, #geek, ...) from scripts/tags.txt.

Independent of profile seeding: tags are part of the application's reference
data, not test fixtures, so they get their own idempotent step. Reads one tag
name per line from tags.txt and inserts whatever is missing in the `tags`
table; existing tags are left untouched.

Run inside the backend container, where POSTGRES_HOST resolves:
    docker compose exec backend python scripts/seed_tags.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from application.database import Database  # noqa: E402

TAGS_FILE = Path(__file__).resolve().parent / "tags.txt"


def load_tag_names() -> list[str]:
    lines = TAGS_FILE.read_text().splitlines()
    return [line.strip() for line in lines if line.strip()]


async def seed_tags():
    tag_names = load_tag_names()
    if not tag_names:
        print(f"No tags found in {TAGS_FILE}, nothing to do.")
        return

    db = Database()
    await db.connect()

    existing_rows = await db.fetch_all("SELECT name FROM tags")
    existing_names = {row["name"] for row in existing_rows}
    missing = [name for name in tag_names if name not in existing_names]

    for name in missing:
        await db.execute("INSERT INTO tags (name) VALUES ($1) ON CONFLICT DO NOTHING", name)

    total = await db.fetch_val("SELECT COUNT(*) FROM tags")
    print(f"Tags: {len(existing_names)} existing, {len(missing)} added, {total} total.")

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(seed_tags())
