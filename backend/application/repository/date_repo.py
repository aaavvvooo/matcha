from asyncpg.connection import Connection

from application.database import Database

# Both participants are still connected and neither has blocked the other. $1/$2 are the two users
# (any order); `c` is the connections row for the pair.
_PAIR_ALLOWED = """
    EXISTS (SELECT 1 FROM connections c
            WHERE c.user_a_id = LEAST({a}, {b}) AND c.user_b_id = GREATEST({a}, {b}))
    AND NOT EXISTS (SELECT 1 FROM blocks b
                    WHERE (b.blocker_id = {a} AND b.blocked_id = {b})
                       OR (b.blocker_id = {b} AND b.blocked_id = {a}))
"""

def _not_blocked(viewer: str, other: str) -> str:
    """SQL fragment: no block in either direction between two user-id expressions (code-defined
    text such as "$1" or "u.id", never user input)."""
    return (
        "NOT EXISTS (SELECT 1 FROM blocks b "
        f"WHERE (b.blocker_id = {viewer} AND b.blocked_id = {other}) "
        f"OR (b.blocker_id = {other} AND b.blocked_id = {viewer}))"
    )


# The other participant of a date row `d` as seen by user parameter $2 (transitions / get_raw).
_OTHER_OF_2 = "CASE WHEN {t}proposer_id = $2 THEN {t}invitee_id ELSE {t}proposer_id END"


# Advisory-lock namespace for the per-proposer cap. Postgres keeps the single-bigint and the
# two-int key spaces apart, so this can never collide with the per-pair (int, int) lock.
_PROPOSER_LOCK_BASE = 7_000_000_000

# A date as a participant sees it: the row plus the *other* user's public bits. $1 = viewer.
_DATE_SELECT = """
    SELECT d.id, d.proposer_id, d.invitee_id, d.title, d.place, d.note, d.scheduled_at, d.status,
           d.created_at, d.updated_at,
           u.id AS other_id, u.username AS other_username, u.first_name AS other_first_name,
           u.last_name AS other_last_name, p.url AS other_photo_url
    FROM dates d
    JOIN users u ON u.id = CASE WHEN d.proposer_id = $1 THEN d.invitee_id ELSE d.proposer_id END
    LEFT JOIN photos p ON p.is_main = true AND p.user_id = u.id
"""

# Columns the transition UPDATEs return (the service re-reads the full row for the response).
_TRANSITION_RETURNING = "RETURNING id, proposer_id, invitee_id, status"


class DateRepository:
    def __init__(self, db: Database):
        self.db = db

    async def create_date(
        self, proposer_id: int, invitee_id: int, title: str, place: str, note: str | None,
        scheduled_at, max_pending_pair: int, max_pending_user: int,
    ) -> tuple[str, int | None]:
        """Inserts a pending proposal if the pair may date. Returns (outcome, date id):
        ("ok", id) | ("not_allowed", None) | ("pair_cap", None) | ("user_cap", None).

        One transaction. The connection row is locked FOR SHARE, so an unlike/block that races with
        the proposal cannot delete it (and then cancel dates) before this insert is visible: it
        waits, then cancels the new date too. Two advisory locks, always taken in this order
        (proposer first, then pair), make both caps exact under concurrency: the per-proposer
        lock serialises one user's proposals (the 20-pending cap spans many pairs); the per-pair
        lock serialises the two users' proposals to each other (the 3-pending cap). Only
        pending dates that are still ahead count: an unanswered, expired proposal is dead.
        """
        lo, hi = min(proposer_id, invitee_id), max(proposer_id, invitee_id)
        pool = self.db.require_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock($1::bigint)", _PROPOSER_LOCK_BASE + proposer_id)
                await conn.execute("SELECT pg_advisory_xact_lock($1::int, $2::int)", lo, hi)
                allowed = await conn.fetchval(
                    """
                    SELECT 1 FROM connections c
                    WHERE c.user_a_id = $1 AND c.user_b_id = $2
                      AND NOT EXISTS (
                          SELECT 1 FROM blocks b
                          WHERE (b.blocker_id = $1 AND b.blocked_id = $2)
                             OR (b.blocker_id = $2 AND b.blocked_id = $1))
                    FOR SHARE OF c
                    """,
                    lo, hi,
                )
                if allowed is None:
                    return "not_allowed", None
                pair_pending = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM dates
                    WHERE status = 'pending' AND scheduled_at > now()
                      AND ((proposer_id = $1 AND invitee_id = $2) OR (proposer_id = $2 AND invitee_id = $1))
                    """,
                    proposer_id, invitee_id,
                )
                if pair_pending >= max_pending_pair:
                    return "pair_cap", None
                user_pending = await conn.fetchval(
                    "SELECT COUNT(*) FROM dates WHERE proposer_id = $1 AND status = 'pending' AND scheduled_at > now()",
                    proposer_id,
                )
                if user_pending >= max_pending_user:
                    return "user_cap", None
                date_id = await conn.fetchval(
                    """
                    INSERT INTO dates (proposer_id, invitee_id, title, place, note, scheduled_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                    """,
                    proposer_id, invitee_id, title, place, note, scheduled_at,
                )
                return "ok", date_id

    async def get_date(self, date_id: int, user_id: int):
        """The date if `user_id` is a participant and the pair is not blocked either way (else None,
        so non-participants and blocked users learn nothing: the same 404)."""
        return await self.db.fetch_one(
            _DATE_SELECT
            + " WHERE d.id = $2 AND (d.proposer_id = $1 OR d.invitee_id = $1) AND "
            + _not_blocked("$1", "u.id"),
            user_id, date_id,
        )

    async def list_dates(
        self, user_id: int, status: str | None, upcoming: bool | None, descending: bool,
        limit: int, offset: int,
    ):
        """The user's dates, hiding those with users blocked in either direction.

        `upcoming` is tri-state: True = still ahead and pending/accepted; False = everything else
        (past, declined, cancelled); None = no filter.
        """
        order = "DESC" if descending else "ASC"  # code-chosen keyword, never user text
        return await self.db.fetch_all(
            _DATE_SELECT
            + f"""
            WHERE (d.proposer_id = $1 OR d.invitee_id = $1)
              AND ($2::text IS NULL OR d.status = $2)
              AND ($3::boolean IS NULL
                   OR $3 = (d.scheduled_at >= now() AND d.status IN ('pending', 'accepted')))
              AND {_not_blocked("$1", "u.id")}
            ORDER BY d.scheduled_at {order}, d.id {order}
            LIMIT $4 OFFSET $5
            """,
            user_id, status, upcoming, limit, offset,
        )

    # ── transitions: one conditional UPDATE each, so concurrent requests can't both win ──
    async def accept(self, date_id: int, invitee_id: int):
        return await self.db.fetch_one(
            f"""
            UPDATE dates d SET status = 'accepted', updated_at = now()
            WHERE d.id = $1 AND d.invitee_id = $2 AND d.status = 'pending' AND d.scheduled_at > now()
              AND {_PAIR_ALLOWED.format(a="d.proposer_id", b="d.invitee_id")}
            {_TRANSITION_RETURNING}
            """,
            date_id, invitee_id,
        )

    async def decline(self, date_id: int, invitee_id: int):
        return await self.db.fetch_one(
            f"""
            UPDATE dates SET status = 'declined', updated_at = now()
            WHERE id = $1 AND invitee_id = $2 AND status = 'pending'
              AND {_not_blocked("$2", "proposer_id")}
            {_TRANSITION_RETURNING}
            """,
            date_id, invitee_id,
        )

    async def cancel(self, date_id: int, user_id: int):
        """Proposer while pending; either participant once accepted and still ahead."""
        return await self.db.fetch_one(
            f"""
            UPDATE dates SET status = 'cancelled', updated_at = now()
            WHERE id = $1
              AND ((status = 'pending' AND proposer_id = $2)
                   OR (status = 'accepted' AND scheduled_at > now()
                       AND (proposer_id = $2 OR invitee_id = $2)))
              AND {_not_blocked("$2", _OTHER_OF_2.format(t=""))}
            {_TRANSITION_RETURNING}
            """,
            date_id, user_id,
        )

    async def get_raw(self, date_id: int, user_id: int):
        """Participant-only row (no joins; None across a block), used to explain why a transition
        did not apply."""
        return await self.db.fetch_one(
            f"""
            SELECT id, proposer_id, invitee_id, status, scheduled_at > now() AS is_future
            FROM dates
            WHERE id = $1 AND (proposer_id = $2 OR invitee_id = $2)
              AND {_not_blocked("$2", _OTHER_OF_2.format(t=""))}
            """,
            date_id, user_id,
        )

    async def cancel_between(self, a: int, b: int, transaction: Connection | None = None) -> int:
        """Closes the pair's open dates because an unlike or a block ended the connection: EVERY
        pending date (expired ones too, so nothing stays answerable across a block) and the
        accepted ones that are still ahead. Past accepted dates stay as history. Idempotent;
        returns how many changed. Pass `transaction` to run inside the caller's transaction."""
        query = """
            UPDATE dates SET status = 'cancelled', updated_at = now()
            WHERE ((proposer_id = $1 AND invitee_id = $2) OR (proposer_id = $2 AND invitee_id = $1))
              AND (status = 'pending' OR (status = 'accepted' AND scheduled_at > now()))
        """
        if transaction is not None:
            result = await transaction.execute(query, a, b)
        else:
            result = await self.db.execute(query, a, b)
        # asyncpg returns the command tag, e.g. "UPDATE 3"
        return int(result.split()[-1]) if result else 0

    async def claim_due_reminders(self, window_hours: int, limit: int):
        """Marks up to `limit` accepted, not yet reminded dates starting within the window and
        returns them (earliest first). One UPDATE … RETURNING over rows locked with SKIP LOCKED: a
        restart or a second loop re-evaluates `reminder_sent_at IS NULL` after the first commits
        (or skips rows it holds), so every date is claimed exactly once. The connection check is
        a backstop; unlike/block already cancel the dates."""
        return await self.db.fetch_all(
            """
            WITH due AS (
                SELECT d.id FROM dates d
                WHERE d.status = 'accepted' AND d.reminder_sent_at IS NULL
                  AND d.scheduled_at > now() AND d.scheduled_at <= now() + make_interval(hours => $1)
                  AND EXISTS (SELECT 1 FROM connections c
                              WHERE c.user_a_id = LEAST(d.proposer_id, d.invitee_id)
                                AND c.user_b_id = GREATEST(d.proposer_id, d.invitee_id))
                  AND NOT EXISTS (SELECT 1 FROM blocks b
                                  WHERE (b.blocker_id = d.proposer_id AND b.blocked_id = d.invitee_id)
                                     OR (b.blocker_id = d.invitee_id AND b.blocked_id = d.proposer_id))
                ORDER BY d.scheduled_at, d.id
                LIMIT $2
                FOR UPDATE OF d SKIP LOCKED
            )
            UPDATE dates d SET reminder_sent_at = now()
            FROM due WHERE d.id = due.id
            RETURNING d.id, d.proposer_id, d.invitee_id
            """,
            window_hours, limit,
        )
