from application.database import Database
from typing import Optional
from asyncpg.connection import Connection


class ProfileRepository:
    def __init__(self, db: Database):
        self.db = db

    async def set_profile(self, user_id: int, data, transaction: Optional[Connection] = None):
        query = """
            INSERT INTO user_profiles (user_id, bio, birth_date, gender, sexual_orientation)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, bio, birth_date, gender, sexual_orientation
        """
        if transaction:
            return await transaction.fetchrow(
                query, user_id, data.bio, data.birth_date,
                data.gender, data.sexual_orientation,
            )
        return await self.db.fetch_one(
            query, user_id, data.bio, data.birth_date,
            data.gender, data.sexual_orientation,
        )

    async def get_profile(self, user_id: int):
        query = """
            SELECT
                u.id AS user_id,
                u.first_name,
                u.last_name,
                u.username,
                u.email,
                u.is_validated,
                u.is_online,
                u.last_seen,
                up.bio,
                up.birth_date,
                up.gender,
                up.sexual_orientation,
                up.profile_picture_id,
                up.latitude,
                up.longitude,
                up.location_label,
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

    async def get_user_tag_ids(self, user_id: int, transaction: Optional[Connection] = None):
        query = "SELECT tag_id FROM user_tags WHERE user_id = $1"
        if transaction:
            rows = await transaction.fetch(query, user_id)
        else:
            rows = await self.db.fetch_all(query, user_id)
        return [row["tag_id"] for row in rows]

    async def get_user_tag_names(self, user_id: int):
        query = """
            SELECT t.name
            FROM user_tags ut
            JOIN tags t ON t.id = ut.tag_id
            WHERE ut.user_id = $1
            ORDER BY t.name
        """
        rows = await self.db.fetch_all(query, user_id)
        return [row["name"] for row in rows]

    async def count_photos(self, user_id: int, transaction: Optional[Connection] = None) -> int:
        query = "SELECT COUNT(*) FROM photos WHERE user_id = $1"
        if transaction:
            return await transaction.fetchval(query, user_id)
        return await self.db.fetch_val(query, user_id)

    async def lock_user_photos(self, user_id: int, transaction: Connection) -> None:
        """Serialise photo writes per user until the transaction ends.

        NO KEY UPDATE still excludes other photo writers but, unlike FOR UPDATE,
        doesn't block FK inserts (likes, views, messages) that reference the user.
        It does block other UPDATEs of this users row (presence, /users/me) for as
        long as the transaction runs, so callers keep storage I/O in it bounded
        (storage clients have short timeouts).
        """
        await transaction.execute("SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE", user_id)

    async def lock_profile(self, user_id: int, transaction: Connection) -> None:
        """Serialise profile/tag rewrites per user until the transaction ends."""
        await transaction.execute(
            "SELECT 1 FROM user_profiles WHERE user_id = $1 FOR NO KEY UPDATE", user_id
        )

    async def count_tags(self, user_id: int) -> int:
        query = "SELECT COUNT(*) FROM user_tags WHERE user_id = $1"
        return await self.db.fetch_val(query, user_id)

    async def get_photo_owner(self, photo_id: int) -> Optional[int]:
        query = "SELECT user_id FROM photos WHERE id = $1"
        return await self.db.fetch_val(query, photo_id)

    async def get_photo_owner_by_key(self, key: str) -> Optional[int]:
        query = "SELECT user_id FROM photos WHERE url = $1"
        return await self.db.fetch_val(query, key)

    # Column names can't be bound as parameters, so only these may be interpolated.
    UPDATABLE_COLUMNS = frozenset({"bio", "birth_date", "gender", "sexual_orientation"})

    async def update_profile(
        self, user_id: int, data: dict, transaction: Optional[Connection] = None
    ):
        unknown = set(data) - self.UPDATABLE_COLUMNS
        if unknown or not data:
            raise ValueError(f"update_profile: invalid columns {sorted(unknown)}")
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

    async def set_location(
        self, user_id: int, latitude: Optional[float], longitude: Optional[float], location_label: Optional[str]
    ):
        query = """
            UPDATE user_profiles
            SET latitude = $2, longitude = $3, location_label = $4, updated_at = NOW()
            WHERE user_id = $1
            RETURNING user_id, latitude, longitude, location_label
        """
        return await self.db.fetch_one(query, user_id, latitude, longitude, location_label)

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

    async def add_photos(
        self,
        user_id: int,
        urls: list[str],
        start_order: int,
        transaction: Optional[Connection] = None,
    ):
        if not urls:
            return []
        query = """
            INSERT INTO photos (user_id, url, "order")
            SELECT $1, u.url, $3 + u.ord - 1
            FROM unnest($2::text[]) WITH ORDINALITY AS u(url, ord)
            ORDER BY u.ord
            RETURNING id, user_id, url, "order", is_main
        """
        if transaction:
            return await transaction.fetch(query, user_id, urls, start_order)
        return await self.db.fetch_all(query, user_id, urls, start_order)

    async def get_existing_urls(
        self, user_id: int, urls: list[str], transaction: Optional[Connection] = None
    ) -> list[str]:
        query = "SELECT url FROM photos WHERE user_id = $1 AND url = ANY($2::text[])"
        if transaction:
            rows = await transaction.fetch(query, user_id, urls)
        else:
            rows = await self.db.fetch_all(query, user_id, urls)
        return [row["url"] for row in rows]

    async def get_photos_urls(
        self, user_id: int, photo_ids: list[int], transaction: Optional[Connection] = None
    ) -> list[str]:
        query = "SELECT url FROM photos WHERE user_id = $1 AND id = ANY($2::int[])"
        if transaction:
            rows = await transaction.fetch(query, user_id, photo_ids)
        else:
            rows = await self.db.fetch_all(query, user_id, photo_ids)
        return [row["url"] for row in rows]

    async def delete_photos(self, user_id: int, photo_ids: list[int], transaction: Connection):
        """Delete photos, clear a deleted profile picture and renumber the rest."""
        await transaction.execute(
            """
            UPDATE user_profiles SET profile_picture_id = NULL, updated_at = NOW()
            WHERE user_id = $1 AND profile_picture_id = ANY($2::int[])
            """,
            user_id, photo_ids,
        )
        deleted = await transaction.fetch(
            """
            DELETE FROM photos
            WHERE user_id = $1 AND id = ANY($2::int[])
            RETURNING id
            """,
            user_id, photo_ids,
        )
        await transaction.execute(
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

    async def get_photo_ids(self, user_id: int, transaction: Connection) -> list[int]:
        rows = await transaction.fetch(
            'SELECT id FROM photos WHERE user_id = $1 ORDER BY "order"', user_id
        )
        return [row["id"] for row in rows]

    async def set_photo_order(self, user_id: int, photo_ids: list[int], transaction: Connection):
        """Renumber the user's photos 1..n following photo_ids (one statement).

        is_main and profile_picture_id are deliberately untouched.
        """
        rows = await transaction.fetch(
            """
            UPDATE photos p
            SET "order" = o.new_order, updated_at = NOW()
            FROM unnest($2::int[]) WITH ORDINALITY AS o(id, new_order)
            WHERE p.id = o.id AND p.user_id = $1
            RETURNING p.id, p.user_id, p.url, p."order", p.is_main
            """,
            user_id, photo_ids,
        )
        return sorted(rows, key=lambda r: r["order"])

    async def add_tags(
        self, user_id: int, tag_ids: list[int], transaction: Optional[Connection] = None
    ):
        if not tag_ids:
            return
        query = """
            INSERT INTO user_tags (user_id, tag_id)
            SELECT $1, tag_id FROM unnest($2::int[]) AS t(tag_id)
            ON CONFLICT DO NOTHING
        """
        if transaction:
            await transaction.execute(query, user_id, tag_ids)
        else:
            await self.db.execute(query, user_id, tag_ids)

    async def get_all_tags(self):
        query = "SELECT id, name FROM tags ORDER BY name"
        return await self.db.fetch_all(query)

    async def delete_tags(
        self, user_id: int, tag_ids: list[int], transaction: Optional[Connection] = None
    ):
        query = """
            DELETE FROM user_tags
            WHERE user_id = $1 AND tag_id = ANY($2::int[])
        """
        if transaction:
            await transaction.execute(query, user_id, tag_ids)
        else:
            await self.db.execute(query, user_id, tag_ids)
