from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
from typing import Optional

from application.schema.fields import Email, PersonName, Username
from application.schema.profile_schemas import PhotoResponse
from application.schema.value_sets import Gender, Orientation


class UserProfileResponse(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    username: str
    bio: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[Gender] = None
    sexual_orientation: Optional[Orientation] = None
    fame_rating: float = 0.0
    is_online: bool = False
    last_seen: Optional[datetime] = None
    location_label: Optional[str] = None
    tags: list[str] = []
    photos: list[PhotoResponse] = []
    is_liked_by_me: bool = False
    liked_me: bool = False
    views_count: int = 0
    likes_count: int = 0
    is_blocked_by_me: bool = False

    model_config = ConfigDict(from_attributes=True)


class LikeResponse(BaseModel):
    liked: bool
    is_match: bool = False


class SimpleUserResponse(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    profile_photo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ViewerResponse(SimpleUserResponse):
    viewed_at: datetime


class UpdateMeRequest(BaseModel):
    first_name: Optional[PersonName] = None
    last_name: Optional[PersonName] = None
    username: Optional[Username] = None
    email: Optional[Email] = None


class BlockResponse(BaseModel):
    blocked: bool


class MeResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    username: str
    email: EmailStr
    is_validated: bool
    # Email change: `email` stays the current, verified address until the link sent to
    # `pending_email` is clicked.
    email_verification_sent: bool = False
    pending_email: Optional[EmailStr] = None

    model_config = ConfigDict(from_attributes=True)
