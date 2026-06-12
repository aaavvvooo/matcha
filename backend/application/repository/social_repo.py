from application.database import Database


class SocialRepository:
    def __init__(self, db: Database):
        self.db = db

    # ── likes ─────────────────────────────────────────────────────────────
    async def like_user(self, liker_id: int, liked_id: int) -> bool:
        query = """
            INSERT INTO likes (liker_id, liked_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            RETURNING liker_id
        """
        row = await self.db.fetch_one(query, liker_id, liked_id)
        return row is not None

    async def unlike_user(self, liker_id: int, liked_id: int) -> bool:
        query = "DELETE FROM likes WHERE liker_id = $1 AND liked_id = $2 RETURNING liker_id"
        row = await self.db.fetch_one(query, liker_id, liked_id)
        return row is not None

    async def has_liked(self, liker_id: int, liked_id: int) -> bool:
        query = "SELECT 1 FROM likes WHERE liker_id = $1 AND liked_id = $2"
        return await self.db.fetch_val(query, liker_id, liked_id) is not None

    async def get_likers(self, user_id: int):
        query = """
            SELECT u.id, u.username, u.full_name, p.url AS profile_photo_url
            FROM likes l
            JOIN users u ON u.id = l.liker_id
            LEFT JOIN photos p ON p.is_main = true AND p.user_id = u.id
            WHERE l.liked_id = $1
            ORDER BY l.created_at DESC
        """
        return await self.db.fetch_all(query, user_id)

    # ── profile views ──────────────────────────────────────────────────────
    async def record_view(self, viewer_id: int, viewed_id: int):
        query = """
            INSERT INTO profile_views (viewer_id, viewed_id)
            VALUES ($1, $2)
            ON CONFLICT (viewer_id, viewed_id) DO UPDATE SET viewed_at = now()
        """
        await self.db.execute(query, viewer_id, viewed_id)

    async def get_viewers(self, user_id: int):
        query = """
            SELECT u.id, u.username, u.full_name, p.url AS profile_photo_url, pv.viewed_at
            FROM profile_views pv
            JOIN users u ON u.id = pv.viewer_id
            LEFT JOIN photos p ON p.is_main = true AND p.user_id = u.id
            WHERE pv.viewed_id = $1
            ORDER BY pv.viewed_at DESC
        """
        return await self.db.fetch_all(query, user_id)

    # ── connections ────────────────────────────────────────────────────────
    async def create_connection(self, a: int, b: int):
        lo, hi = min(a, b), max(a, b)
        query = """
            INSERT INTO connections (user_a_id, user_b_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
        """
        await self.db.execute(query, lo, hi)

    async def remove_connection(self, a: int, b: int):
        lo, hi = min(a, b), max(a, b)
        await self.db.execute(
            "DELETE FROM connections WHERE user_a_id = $1 AND user_b_id = $2", lo, hi
        )

    async def are_connected(self, a: int, b: int) -> bool:
        lo, hi = min(a, b), max(a, b)
        result = await self.db.fetch_val(
            "SELECT 1 FROM connections WHERE user_a_id = $1 AND user_b_id = $2", lo, hi
        )
        return result is not None

    async def count_connections(self, user_id: int) -> int:
        return await self.db.fetch_val(
            "SELECT COUNT(*) FROM connections WHERE user_a_id = $1 OR user_b_id = $1",
            user_id,
        )

    # ── blocks ─────────────────────────────────────────────────────────────
    async def block_user(self, blocker_id: int, blocked_id: int):
        await self.db.execute(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            blocker_id, blocked_id,
        )

    async def is_blocked(self, blocker_id: int, blocked_id: int) -> bool:
        result = await self.db.fetch_val(
            "SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2",
            blocker_id, blocked_id,
        )
        return result is not None

    async def get_blocked_ids(self, user_id: int) -> list[int]:
        rows = await self.db.fetch_all(
            "SELECT blocked_id FROM blocks WHERE blocker_id = $1", user_id
        )
        return [r["blocked_id"] for r in rows]

    # ── reports ────────────────────────────────────────────────────────────
    async def report_user(self, reporter_id: int, reported_id: int):
        await self.db.execute(
            "INSERT INTO reports (reporter_id, reported_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            reporter_id, reported_id,
        )

    # ── notifications ──────────────────────────────────────────────────────
    async def create_notification(self, user_id: int, type: str, from_user: int | None = None):
        query = """
            INSERT INTO notifications (user_id, type, from_user)
            VALUES ($1, $2, $3)
            RETURNING id
        """
        return await self.db.fetch_val(query, user_id, type, from_user)

    async def get_notifications(self, user_id: int):
        query = """
            SELECT n.id, n.type, n.from_user, n.is_read, n.created_at,
                   u.username AS from_username, p.url AS from_photo_url
            FROM notifications n
            LEFT JOIN users u ON u.id = n.from_user
            LEFT JOIN photos p ON p.is_main = true AND p.user_id = n.from_user
            WHERE n.user_id = $1
            ORDER BY n.created_at DESC
            LIMIT 100
        """
        return await self.db.fetch_all(query, user_id)

    async def mark_notifications_read(self, user_id: int):
        await self.db.execute(
            "UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false",
            user_id,
        )

    async def unread_count(self, user_id: int) -> int:
        return await self.db.fetch_val(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false",
            user_id,
        )

    # ── fame rating ────────────────────────────────────────────────────────
    async def recalculate_fame(self, user_id: int) -> float:
        likes_received = await self.db.fetch_val(
            "SELECT COUNT(*) FROM likes WHERE liked_id = $1", user_id
        )
        views = await self.db.fetch_val(
            "SELECT COUNT(*) FROM profile_views WHERE viewed_id = $1", user_id
        )
        connections = await self.count_connections(user_id)
        fame = min(100.0, (likes_received * 3) + (views * 1) + (connections * 5))
        await self.db.execute(
            "UPDATE user_profiles SET fame_rating = $1 WHERE user_id = $2",
            fame, user_id,
        )
        return fame
