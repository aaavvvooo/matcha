"""Chat: send over WebSocket, conversations and history over REST (DESIGN.md §7, EPICS E5)."""

import unicodedata
from typing import Any

from fastapi import HTTPException, status

from application.database import Database
from application.repository.chat_repo import ChatRepository
from application.schema.chat_schemas import ConversationResponse, MessageResponse
from application.service.notification_service import NotificationService
from application.utils.photo_url import to_photo_url
from application.websocket.manager import presence_manager

# Ids are Postgres int4; anything larger can never exist (and would make asyncpg raise).
MAX_USER_ID = 2_147_483_647

# Longest accepted message body, in characters (after stripping).
MAX_BODY_LENGTH = 2000

NOT_CONNECTED_DETAIL = "You are not connected with this user"


def _has_unsafe_chars(text: str) -> bool:
    """True for text Postgres/asyncpg can't store or that has no place in a chat line:
    NUL and other control characters (except newline and tab), and lone surrogates."""
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return True
    return any(
        unicodedata.category(ch) == "Cc" and ch not in "\n\t"
        for ch in text
    )


class ChatError(Exception):
    """A rejected chat action. `code` is machine-readable, `detail` is safe to show the user."""

    def __init__(self, code: str, detail: str):
        super().__init__(code)
        self.code = code
        self.detail = detail


class ChatService:
    def __init__(self, db: Database):
        self.chat_repo = ChatRepository(db)
        self.notifications = NotificationService(db)

    # ── WebSocket send ─────────────────────────────────────────────────────
    async def send_message(
        self, sender_id: int, frame: dict[str, Any], ref: str | None = None
    ) -> dict[str, Any]:
        """Validates, persists and fans out one `{"type":"message"}` frame.

        `ref` is the client's correlation id; it is echoed only to the sender's sockets.
        Raises ChatError for anything the sender can fix. Returns the payload sent to the recipient.
        """
        to = frame.get("to")
        # bool is an int subclass; reject it explicitly.
        if not isinstance(to, int) or isinstance(to, bool) or not 1 <= to <= MAX_USER_ID:
            raise ChatError("invalid_recipient", "Choose someone to message")
        if to == sender_id:
            raise ChatError("invalid_recipient", "You cannot message yourself")

        body = frame.get("body")
        if not isinstance(body, str):
            raise ChatError("invalid_body", "Message must be text")
        body = body.strip()
        if not body:
            raise ChatError("empty_body", "Message cannot be empty")
        if _has_unsafe_chars(body):
            raise ChatError("invalid_body", "Message contains characters that are not allowed")
        if len(body) > MAX_BODY_LENGTH:
            raise ChatError("body_too_long", f"Message is too long (max {MAX_BODY_LENGTH} characters)")

        row = await self.chat_repo.insert_message(sender_id, to, body)
        if row is None:
            # Same answer for "never connected", "unliked" and "blocked": don't reveal which.
            raise ChatError("not_connected", NOT_CONNECTED_DETAIL)

        payload = {
            "type": "message",
            "id": row["id"],
            "from": sender_id,
            "from_username": row["sender_username"],
            "to": to,
            "body": body,
            "sent_at": row["sent_at"].isoformat(),
        }
        # Sender's sockets too: other tabs, and the sending tab learns the persisted id.
        await presence_manager.send_to_user(to, payload)
        await presence_manager.send_to_user(sender_id, {**payload, "ref": ref} if ref else payload)

        # The message is already stored and delivered; a failed notification must not
        # make the sender think it was lost.
        await self.notifications.notify_safe(to, "message", sender_id)
        return payload

    # ── REST ───────────────────────────────────────────────────────────────
    async def list_conversations(self, user_id: int) -> list[ConversationResponse]:
        rows = await self.chat_repo.list_conversations(user_id)
        result = []
        for row in rows:
            data = dict(row)
            data["photo_url"] = to_photo_url(data.get("photo_url"))
            result.append(ConversationResponse(**data))
        return result

    async def _require_chat_allowed(self, user_id: int, other_id: int) -> None:
        if user_id == other_id or not await self.chat_repo.can_chat(user_id, other_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_CONNECTED_DETAIL)

    async def get_messages(
        self, user_id: int, other_id: int, limit: int, before_id: int | None
    ) -> list[MessageResponse]:
        """Oldest-to-newest page. Opening the newest page marks the other user's messages read."""
        await self._require_chat_allowed(user_id, other_id)
        rows = await self.chat_repo.get_messages(user_id, other_id, limit, before_id)
        if before_id is None:
            await self.chat_repo.mark_read(user_id, other_id)
        return [MessageResponse(**dict(r)) for r in reversed(rows)]

    async def mark_read(self, user_id: int, other_id: int) -> int:
        await self._require_chat_allowed(user_id, other_id)
        return await self.chat_repo.mark_read(user_id, other_id)
