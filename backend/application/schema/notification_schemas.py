from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from application.schema.value_sets import NotificationType


class NotificationResponse(BaseModel):
    id: int
    type: NotificationType
    from_user: Optional[int] = None
    from_username: Optional[str] = None
    from_photo_url: Optional[str] = None
    is_read: bool = False
    created_at: datetime


class MarkReadResponse(BaseModel):
    updated: int


class UnreadCountResponse(BaseModel):
    unread: int
