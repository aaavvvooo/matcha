from application.database import Database
from typing import Optional
from asyncpg.connection import Connection


class ProfileRepository:
    def __init__(self, db: Database):
        self.db = db

    async def set_profile(self, data, transaction: Optional[Connection] = None):
        query = """
            INSERT INTO user_profiles (user_id, bio, birth_date, gender, sexual_orientation)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, bio, birth_date, gender, sexual_orientation
        """
        try:
            if transaction:
                return await transaction.fetchrow(
                    query, data.user_id, data.bio, data.birth_date,
                    data.gender, data.sexual_orientation,
                )
            return await self.db.fetch_one(
                query, data.user_id, data.bio, data.birth_date,
                data.gender, data.sexual_orientation,
            )
        except Exception as e:
            print(e)
            raise e

    async def set_photos(self, user_id, data, transaction: Optional[Connection] = None):
        if not data:
            return []

        values_parts = []
        params = []
        param_index = 1
        for i, url in enumerate(data, start=1):
            values_parts.append(f"(${param_index}, ${param_index+1}, ${param_index+2})")
            params.extend([user_id, url, i])
            param_index += 3

        query = f"""
            INSERT INTO photos (user_id, url, "order")
            VALUES {", ".join(values_parts)}
            RETURNING id, user_id, url, "order", is_main
        """
        try:
            if transaction:
                return await transaction.fetch(query, *params)
            return await self.db.fetch_all(query, *params)
        except Exception as e:
            print(e)
            raise e

    async def get_profile(self, user_id: int):
        query = """
            SELECT
                u.id AS user_id,
                u.full_name,
                u.username,
                u.email,
                up.bio,
                up.birth_date,
                up.gender,
                up.sexual_orientation,
                up.profile_picture_id,
                COALESCE(up.fame_rating, 0) AS fame_rating
            FROM users u
            LEFT JOIN user_profiles up ON up.user_id = u.id
            WHERE u.id = $1
        """
        return await self.db.fetch_one(query, user_id)

    async def get_user_photos(self, user_id: int):
        query = """
            SELECT id, user_id, url, "order", is_main
            FROM photos
            WHERE user_id = $1
            ORDER BY "order"
        """
        return await self.db.fetch_all(query, user_id)

    async def get_user_tag_ids(self, user_id: int):
        query = "SELECT tag_id FROM user_tags WHERE user_id = $1"
        rows = await self.db.fetch_all(query, user_id)
        return [row["tag_id"] for row in rows]

    async def count_photos(self, user_id: int) -> int:
        query = "SELECT COUNT(*) FROM photos WHERE user_id = $1"
        return await self.db.fetch_val(query, user_id)

    async def count_tags(self, user_id: int) -> int:
        query = "SELECT COUNT(*) FROM user_tags WHERE user_id = $1"
        return await self.db.fetch_val(query, user_id)

    async def get_photo_owner(self, photo_id: int) -> Optional[int]:
        query = "SELECT user_id FROM photos WHERE id = $1"
        return await self.db.fetch_val(query, photo_id)

    async def update_profile(
        self, user_id: int, data: dict, transaction: Optional[Connection] = None
    ):
        set_parts = []
        params = [user_id]
        for i, (col, val) in enumerate(data.items(), start=2):
            set_parts.append(f"{col} = ${i}")
            params.append(val)

        query = f"""
            UPDATE user_profiles
            SET {", ".join(set_parts)}, updated_at = NOW()
            WHERE user_id = $1
            RETURNING id, user_id, bio, birth_date, gender, sexual_orientation,
                      profile_picture_id, fame_rating
        """
        if transaction:
            return await transaction.fetchrow(query, *params)
        return await self.db.fetch_one(query, *params)

    async def set_profile_picture(self, user_id: int, photo_id: int):
        pool = self.db.require_pool()
        async with pool.acquire() as connection:
            async with connection.transaction():
                await connection.execute(
                    "UPDATE photos SET is_main = false, updated_at = NOW() WHERE user_id = $1",
                    user_id,
                )
                photo = await connection.fetchrow(
                    """
                    UPDATE photos SET is_main = true, updated_at = NOW()
                    WHERE id = $1 AND user_id = $2
                    RETURNING id, user_id, url, "order", is_main
                    """,
                    photo_id, user_id,
                )
                if photo:
                    await connection.execute(
                        """
                        UPDATE user_profiles
                        SET profile_picture_id = $1, updated_at = NOW()
                        WHERE user_id = $2
                        """,
                        photo_id, user_id,
                    )
        return photo

    async def add_photos(self, user_id: int, urls: list[str], start_order: int):
        if not urls:
            return []

        values_parts = []
        params = []
        param_index = 1
        for i, url in enumerate(urls):
            values_parts.append(f"(${param_index}, ${param_index+1}, ${param_index+2})")
            params.extend([user_id, url, start_order + i])
            param_index += 3

        query = f"""
            INSERT INTO photos (user_id, url, "order")
            VALUES {", ".join(values_parts)}
            RETURNING id, user_id, url, "order", is_main
        """
        return await self.db.fetch_all(query, *params)

    async def delete_photos(self, user_id: int, photo_ids: list[int]):
        pool = self.db.require_pool()
        async with pool.acquire() as connection:
            async with connection.transaction():
                await connection.execute(
                    """
                    UPDATE user_profiles SET profile_picture_id = NULL, updated_at = NOW()
                    WHERE user_id = $1 AND profile_picture_id = ANY($2::int[])
                    """,
                    user_id, photo_ids,
                )
                deleted = await connection.fetch(
                    """
                    DELETE FROM photos
                    WHERE user_id = $1 AND id = ANY($2::int[])
                    RETURNING id
                    """,
                    user_id, photo_ids,
                )
                await connection.execute(
                    """
                    WITH ranked AS (
                        SELECT id, ROW_NUMBER() OVER (ORDER BY "order") AS new_order
                        FROM photos WHERE user_id = $1
                    )
                    UPDATE photos p
                    SET "order" = r.new_order, updated_at = NOW()
                    FROM ranked r
                    WHERE p.id = r.id
                    """,
                    user_id,
                )
        return [row["id"] for row in deleted]

    async def add_tags(self, user_id: int, tag_ids: list[int]):
        if not tag_ids:
            return

        values_parts = []
        params = []
        param_index = 1
        for tag_id in tag_ids:
            values_parts.append(f"(${param_index}, ${param_index+1})")
            params.extend([user_id, tag_id])
            param_index += 2

        query = f"""
            INSERT INTO user_tags (user_id, tag_id)
            VALUES {", ".join(values_parts)}
            ON CONFLICT DO NOTHING
        """
        await self.db.execute(query, *params)

    async def get_all_tags(self):
        query = "SELECT id, name FROM tags ORDER BY name"
        return await self.db.fetch_all(query)

    async def delete_tags(self, user_id: int, tag_ids: list[int]):
        query = """
            DELETE FROM user_tags
            WHERE user_id = $1 AND tag_id = ANY($2::int[])
        """
        await self.db.execute(query, user_id, tag_ids)
