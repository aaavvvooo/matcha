from application.database import Database


class TagRepository:
    def __init__(self, db: Database):
        self.db = db

    async def get_all_tags(self):
        return await self.db.fetch_all("SELECT id, name FROM tags ORDER BY name")

    async def get_tag_by_name(self, name: str):
        return await self.db.fetch_one("SELECT id, name FROM tags WHERE name = $1", name)

    async def create_tag(self, name: str):
        return await self.db.fetch_one(
            "INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name",
            name,
        )

    async def get_tags_for_user(self, user_id: int):
        return await self.db.fetch_all(
            """
            SELECT t.id, t.name FROM tags t
            JOIN user_tags ut ON ut.tag_id = t.id
            WHERE ut.user_id = $1
            ORDER BY t.name
            """,
            user_id,
        )
