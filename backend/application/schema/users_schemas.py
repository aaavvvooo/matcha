from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional

from application.schema.profile_schemas import PhotoResponse


class UserProfileResponse(BaseModel):
    user_id: int
    full_name: str
    username: str
    bio: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    sexual_orientation: Optional[str] = None
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

    model_config = ConfigDict(from_attributes=True)


class LikeResponse(BaseModel):
    liked: bool
    is_match: bool = False


class SimpleUserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    profile_photo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ViewerResponse(SimpleUserResponse):
    viewed_at: datetime


class UpdateMeRequest(BaseModel):
    full_name: Optional[str] = Field(None, max_length=100)
    username: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None


class MeResponse(BaseModel):
    id: int
    full_name: str
    username: str
    email: EmailStr
    is_validated: bool
    email_verification_sent: bool = False

    model_config = ConfigDict(from_attributes=True)
