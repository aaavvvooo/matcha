"""Date scheduling between connected users (DESIGN.md §5/§7, EPICS B5)."""

import logging

from asyncpg.connection import Connection
from fastapi import HTTPException, status

from application.database import Database
from application.repository.date_repo import DateRepository
from application.schema.date_schemas import DateCreate, DatePartner, DateResponse
from application.schema.value_sets import DateStatus, NotificationType
from application.service.notification_service import NotificationService
from application.utils.photo_url import to_photo_url

logger = logging.getLogger(__name__)

# Spam brakes: open (pending) proposals between one pair, and from one proposer overall.
MAX_PENDING_PER_PAIR = 3
MAX_PENDING_PER_USER = 20
# Accepted dates starting within this many hours get one `date_reminder` per participant.
REMINDER_WINDOW_HOURS = 24
# Dates claimed per statement, and statements per run (a backlog drains over a few ticks).
REMINDER_BATCH = 200
REMINDER_MAX_BATCHES = 5

# Same answer for never connected, unliked, blocked and non-existent users: don't reveal which.
NOT_CONNECTED_DETAIL = "You are not connected with this user"
NOT_FOUND_DETAIL = "Date not found"

# Event sent to the other participant for each transition.
_TRANSITION_EVENT: dict[str, NotificationType] = {
    "accepted": "date_accepted",
    "declined": "date_declined",
    "cancelled": "date_cancelled",
}


def _to_response(row) -> DateResponse:
    data = dict(row)
    partner = DatePartner(
        id=data.pop("other_id"),
        username=data.pop("other_username"),
        first_name=data.pop("other_first_name"),
        last_name=data.pop("other_last_name"),
        photo_url=to_photo_url(data.pop("other_photo_url")),
    )
    return DateResponse(**data, with_user=partner)


class DateService:
    def __init__(self, db: Database):
        self.date_repo = DateRepository(db)
        self.notifications = NotificationService(db)

    async def _load(self, date_id: int, user_id: int) -> DateResponse:
        row = await self.date_repo.get_date(date_id, user_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL)
        return _to_response(row)

    # ── propose ────────────────────────────────────────────────────────────
    async def propose(self, proposer_id: int, body: DateCreate) -> DateResponse:
        if body.invitee_id == proposer_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot date yourself")
        outcome, date_id = await self.date_repo.create_date(
            proposer_id, body.invitee_id, body.title, body.place, body.note, body.scheduled_at,
            MAX_PENDING_PER_PAIR, MAX_PENDING_PER_USER,
        )
        if outcome == "not_allowed":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_CONNECTED_DETAIL)
        if outcome == "pair_cap":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You already have the maximum number of pending proposals with this user",
            )
        if outcome == "user_cap" or date_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have too many pending proposals; wait for some to be answered",
            )
        await self.notifications.notify_safe(body.invitee_id, "date_proposed", proposer_id)
        return await self._load(date_id, proposer_id)

    # ── transitions ────────────────────────────────────────────────────────
    async def _explain_rejection(self, date_id: int, user_id: int, action: str) -> HTTPException:
        """Why the conditional UPDATE changed nothing: 404 not yours, 403 wrong role or no longer
        connected, 409 wrong state."""
        row = await self.date_repo.get_raw(date_id, user_id)
        if row is None:
            return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL)
        if action in ("accept", "decline") and row["invitee_id"] != user_id:
            return HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=f"Only the invitee can {action} a date"
            )
        if action == "cancel" and row["status"] == "pending" and row["proposer_id"] != user_id:
            return HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the proposer can cancel a pending date; decline it instead",
            )
        if row["status"] != "pending" and action != "cancel":
            return HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=f"This date is already {row['status']}"
            )
        if action == "cancel":
            if row["status"] == "accepted" and not row["is_future"]:
                return HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="This date has already taken place"
                )
            return HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="This date can't be cancelled"
            )
        if not row["is_future"]:
            return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This date is in the past")
        # Pending, ours, in the future: only a lost connection (or a block) can be left.
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_CONNECTED_DETAIL)

    async def _transition(self, date_id: int, user_id: int, action: str) -> DateResponse:
        repo_call = {
            "accept": self.date_repo.accept,
            "decline": self.date_repo.decline,
            "cancel": self.date_repo.cancel,
        }[action]
        changed = await repo_call(date_id, user_id)
        if changed is None:
            raise await self._explain_rejection(date_id, user_id, action)
        other = changed["invitee_id"] if changed["proposer_id"] == user_id else changed["proposer_id"]
        await self.notifications.notify_safe(other, _TRANSITION_EVENT[changed["status"]], user_id)
        return await self._load(date_id, user_id)

    async def accept(self, user_id: int, date_id: int) -> DateResponse:
        return await self._transition(date_id, user_id, "accept")

    async def decline(self, user_id: int, date_id: int) -> DateResponse:
        return await self._transition(date_id, user_id, "decline")

    async def cancel(self, user_id: int, date_id: int) -> DateResponse:
        return await self._transition(date_id, user_id, "cancel")

    # ── list ───────────────────────────────────────────────────────────────
    async def list_dates(
        self, user_id: int, status_filter: DateStatus | None, upcoming: bool | None, order: str,
        limit: int, offset: int,
    ) -> list[DateResponse]:
        rows = await self.date_repo.list_dates(
            user_id, status_filter, upcoming, order == "desc", limit, offset
        )
        return [_to_response(r) for r in rows]

    # ── disconnect hook ────────────────────────────────────────────────────
    async def cancel_between(self, a: int, b: int, transaction: Connection | None = None) -> int:
        """Called when an unlike or a block ends the connection, inside the same transaction as the
        connection delete (SocialService): every pending date and every future accepted date
        between the pair is cancelled, so none survives a disconnect. Silent by design: the
        `unlike` notification already tells the other user, and a block notifies nobody. The
        dates list is hidden (block) or reloaded on `unlike` by the client."""
        return await self.date_repo.cancel_between(a, b, transaction)

    # ── reminders ──────────────────────────────────────────────────────────
    async def send_due_reminders(self) -> int:
        """Claims accepted dates starting within REMINDER_WINDOW_HOURS (once each, atomically, at
        most REMINDER_BATCH per statement) and notifies both participants. Returns how many dates
        were claimed."""
        claimed = 0
        for _ in range(REMINDER_MAX_BATCHES):
            rows = await self.date_repo.claim_due_reminders(REMINDER_WINDOW_HOURS, REMINDER_BATCH)
            for row in rows:
                await self.notifications.notify_safe(row["proposer_id"], "date_reminder", row["invitee_id"])
                await self.notifications.notify_safe(row["invitee_id"], "date_reminder", row["proposer_id"])
            claimed += len(rows)
            if len(rows) < REMINDER_BATCH:
                break
        return claimed
