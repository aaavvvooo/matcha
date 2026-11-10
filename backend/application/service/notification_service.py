"""Persist + push notifications (DESIGN.md §7, EPICS E6)."""

import logging
from typing import Optional

from application.database import Database
from application.repository.social_repo import SocialRepository
from application.schema.notification_schemas import NotificationResponse
from application.schema.value_sets import NotificationType
from application.utils.photo_url import to_photo_url
from application.websocket.manager import presence_manager

logger = logging.getLogger(__name__)

# A profile visit notifies at most once per viewer per this many minutes.
VIEW_NOTIFY_COOLDOWN_MINUTES = 60


def _to_response(row) -> NotificationResponse:
    data = dict(row)
    data["from_photo_url"] = to_photo_url(data.get("from_photo_url"))
    return NotificationResponse(**data)


class NotificationService:
    def __init__(self, db: Database):
        self.social_repo = SocialRepository(db)

    async def notify(self, to_user: int, type: NotificationType, from_user: int) -> Optional[int]:
        """Store a notification and push it to the recipient's open sockets.

        Returns the notification id, or None when it is suppressed: self-actions,
        a block in either direction (E6.6), a message between users who are not
        connected, or a repeated profile view.
        """
        if to_user == from_user:
            return None
        if await self.social_repo.is_blocked_either_way(to_user, from_user):
            return None
        # A message notification only ever follows a stored message, which needs a connection.
        if type == "message" and not await self.social_repo.are_connected(to_user, from_user):
            return None
        if type == "view" and await self.social_repo.has_recent_notification(
            to_user, "view", from_user, VIEW_NOTIFY_COOLDOWN_MINUTES
        ):
            return None

        notification_id = await self.social_repo.create_notification(to_user, type, from_user)
        row = await self.social_repo.get_notification(notification_id)
        if row is not None:
            n = _to_response(row)
            await presence_manager.send_to_user(
                to_user,
                {
                    "type": "notification",
                    # Authoritative unread total, so the badge can't drift from live pushes.
                    "unread": await self.social_repo.unread_count(to_user),
                    "id": n.id,
                    "event": n.type,
                    "from_user": n.from_user,
                    "from_username": n.from_username,
                    "from_photo_url": n.from_photo_url,
                    "created_at": n.created_at.isoformat(),
                },
            )
        return notification_id

    async def notify_safe(self, to_user: int, type: NotificationType, from_user: int) -> Optional[int]:
        """notify() for call sites that already did their real work (a like, a stored message):
        a failing notification is logged and swallowed so it can't fail or undo that action."""
        try:
            return await self.notify(to_user, type, from_user)
        except Exception:
            logger.exception("Notification (%s) failed", type)
            return None

    async def unread_count(self, user_id: int) -> int:
        return await self.social_repo.unread_count(user_id)

    async def list(self, user_id: int, limit: int, offset: int) -> list[NotificationResponse]:
        rows = await self.social_repo.get_notifications(user_id, limit, offset)
        return [_to_response(r) for r in rows]

    async def mark_all_read(self, user_id: int) -> int:
        return await self.social_repo.mark_notifications_read(user_id)
