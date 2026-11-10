from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ConversationResponse(BaseModel):
    user_id: int
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    photo_url: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    # Last message of the thread; all None until the first message is sent.
    last_message: Optional[str] = None
    last_sender_id: Optional[int] = None
    sent_at: Optional[datetime] = None
    unread_count: int = 0
    connected_at: Optional[datetime] = None


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    body: str
    sent_at: datetime
    is_read: bool = False


class MarkReadResponse(BaseModel):
    updated: int
