from application.database import Database
from typing import Optional
from asyncpg.connection import Connection


class ProfileRepository:
    def __init__(self, db: Database):
        self.db = db

    async def set_profile(
        self,
        data,
        transaction: Optional[Connection] = None,
    ):
        query = """
            INSERT INTO user_profiles (user_id, bio, birth_date, gender, sexual_orientation)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, bio, birth_date, gender, sexual_orientation
        """
        try:
            if not transaction:
                profile = await self.db.execute(
                    query,
                    data.user_id,
                    data.bio,
                    data.birth_date,
                    data.gender,
                    data.sexual_orientation
                )
            else:
                profile = await transaction.fetchrow(
                    query,
                    data.user_id,
                    data.bio,
                    data.birth_date,
                    data.gender,
                    data.sexual_orientation
                )
            return profile
        except Exception as e:
            print(e)
            raise e

    async def set_photos(self, user_id, data, transaction: Optional[Connection] = None):
        photos_count = len(data)
        if photos_count == 0:
            return []

        values_parts = []
        params = []
        param_index = 1
        order = 1

        for url in data:
            values_parts.append(
                f"(${param_index}, ${param_index+1}, ${param_index+2})")
            params.extend([user_id, url, order])
            order += 1
            param_index += 3

        query = f"""
            INSERT INTO photos (user_id, url, "order")
            VALUES {", ".join(values_parts)}
            RETURNING id, user_id, url, "order"
        """

        try:
            conn = transaction or self.db
            rows = await conn.fetch(query, *params)
            return rows
        except Exception as e:
            print(e)
            raise e
