from application.database import Database

MAX_PHOTOS = 5


class PhotoRepository:
    def __init__(self, db: Database):
        self.db = db

    async def count_photos(self, user_id: int) -> int:
        return await self.db.fetch_val(
            "SELECT COUNT(*) FROM photos WHERE user_id = $1", user_id
        ) or 0

    async def get_photos(self, user_id: int):
        return await self.db.fetch_all(
            'SELECT id, user_id, url, "order", is_main, created_at FROM photos WHERE user_id = $1 ORDER BY "order"',
            user_id,
        )

    async def get_photo(self, photo_id: int):
        return await self.db.fetch_one(
            'SELECT id, user_id, url, "order", is_main FROM photos WHERE id = $1',
            photo_id,
        )

    async def create_photo(self, user_id: int, url: str, order: int) -> dict:
        return await self.db.fetch_one(
            """
            INSERT INTO photos (user_id, url, "order", is_main)
            VALUES ($1, $2, $3, false)
            RETURNING id, user_id, url, "order", is_main, created_at
            """,
            user_id, url, order,
        )

    async def delete_photo(self, photo_id: int) -> None:
        await self.db.execute("DELETE FROM photos WHERE id = $1", photo_id)

    async def set_main_photo(self, photo_id: int, user_id: int) -> None:
        pool = self.db.require_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "UPDATE photos SET is_main = false WHERE user_id = $1", user_id
                )
                await conn.execute(
                    "UPDATE photos SET is_main = true WHERE id = $1", photo_id
                )
                await conn.execute(
                    """
                    INSERT INTO user_profiles (user_id, profile_picture_id)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id) DO UPDATE SET profile_picture_id = EXCLUDED.profile_picture_id
                    """,
                    user_id, photo_id,
                )

    async def clear_profile_picture_if_deleted(self, photo_id: int, user_id: int) -> None:
        await self.db.execute(
            """
            UPDATE user_profiles SET profile_picture_id = NULL
            WHERE user_id = $1 AND profile_picture_id = $2
            """,
            user_id, photo_id,
        )
