from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

from application.schema.profile_schemas import PhotoResponse


class UserProfileResponse(BaseModel):
    user_id: int
    full_name: str
    username: str
    bio: Optional[str] = None
    gender: Optional[str] = None
    sexual_orientation: Optional[str] = None
    fame_rating: float = 0.0
    is_online: bool = False
    tags: list[str] = []
    photos: list[PhotoResponse] = []
    is_liked_by_me: bool = False
    liked_me: bool = False

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
