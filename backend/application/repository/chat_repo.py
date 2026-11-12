from application.database import Database


class ChatRepository:
    def __init__(self, db: Database):
        self.db = db

    async def can_chat(self, a: int, b: int) -> bool:
        """True while a and b are connected and neither has blocked the other."""
        lo, hi = min(a, b), max(a, b)
        found = await self.db.fetch_val(
            """
            SELECT 1 FROM connections c
            WHERE c.user_a_id = $1 AND c.user_b_id = $2
              AND NOT EXISTS (
                  SELECT 1 FROM blocks b
                  WHERE (b.blocker_id = $1 AND b.blocked_id = $2)
                     OR (b.blocker_id = $2 AND b.blocked_id = $1))
            """,
            lo, hi,
        )
        return found is not None

    async def insert_message(self, sender_id: int, receiver_id: int, body: str):
        """Stores a message only if the pair is connected and unblocked, in one statement
        (so an unlike or block racing with the send can't slip a message through).

        Returns the new row (id, sent_at, sender_username) or None when chat is not allowed.
        """
        lo, hi = min(sender_id, receiver_id), max(sender_id, receiver_id)
        return await self.db.fetch_one(
            """
            WITH ins AS (
                INSERT INTO messages (sender_id, receiver_id, body, is_read)
                SELECT $1::int, $2::int, $3::text, false
                WHERE EXISTS (SELECT 1 FROM connections c WHERE c.user_a_id = $4::int AND c.user_b_id = $5::int)
                  AND NOT EXISTS (
                      SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = $1 AND b.blocked_id = $2)
                         OR (b.blocker_id = $2 AND b.blocked_id = $1))
                RETURNING id, sent_at
            )
            SELECT ins.id, ins.sent_at, u.username AS sender_username
            FROM ins JOIN users u ON u.id = $1
            """,
            sender_id, receiver_id, body, lo, hi,
        )

    async def list_conversations(self, user_id: int):
        """Connected, unblocked users with their latest message and unread count,
        most recent activity (last message, else the connection) first."""
        return await self.db.fetch_all(
            """
            SELECT u.id AS user_id, u.username, u.first_name, u.last_name,
                   u.is_online, u.last_seen, p.url AS photo_url,
                   lm.body AS last_message, lm.sender_id AS last_sender_id, lm.sent_at,
                   COALESCE(uc.cnt, 0) AS unread_count,
                   c.created_at AS connected_at
            FROM connections c
            JOIN users u ON u.id = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
            LEFT JOIN photos p ON p.is_main = true AND p.user_id = u.id
            LEFT JOIN LATERAL (
                SELECT m.body, m.sender_id, m.sent_at
                FROM messages m
                WHERE (m.sender_id = $1 AND m.receiver_id = u.id)
                   OR (m.sender_id = u.id AND m.receiver_id = $1)
                ORDER BY m.id DESC
                LIMIT 1
            ) lm ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS cnt
                FROM messages m
                WHERE m.sender_id = u.id AND m.receiver_id = $1 AND m.is_read = false
            ) uc ON true
            WHERE (c.user_a_id = $1 OR c.user_b_id = $1)
              AND NOT EXISTS (
                  SELECT 1 FROM blocks b
                  WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                     OR (b.blocker_id = u.id AND b.blocked_id = $1))
            ORDER BY COALESCE(lm.sent_at, c.created_at) DESC, u.id
            """,
            user_id,
        )

    async def get_messages(self, user_id: int, other_id: int, limit: int, before_id: int | None):
        """Newest `limit` messages of the thread (older than before_id when given), newest first."""
        return await self.db.fetch_all(
            """
            SELECT id, sender_id, receiver_id, body, sent_at, COALESCE(is_read, false) AS is_read
            FROM messages
            WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
              AND ($3::int IS NULL OR id < $3)
            ORDER BY id DESC
            LIMIT $4
            """,
            user_id, other_id, before_id, limit,
        )

    async def mark_read(self, user_id: int, other_id: int) -> int:
        """Marks messages sent by other_id to user_id as read; returns how many changed."""
        result = await self.db.execute(
            "UPDATE messages SET is_read = true WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false",
            user_id, other_id,
        )
        # asyncpg returns the command tag, e.g. "UPDATE 3"
        return int(result.split()[-1]) if result else 0
