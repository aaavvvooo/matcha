from pydantic import BaseModel, EmailStr, Field, ConfigDict, StringConstraints
from datetime import datetime
from typing import Annotated, Optional

from application.schema.fields import BirthDate, DbId, SafeMultiline, SafeText
from application.schema.value_sets import Gender, Orientation

Bio = Annotated[str, StringConstraints(max_length=500), SafeMultiline]
City = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255), SafeText]


class SetProfileRequest(BaseModel):
    # The owner always comes from the access token, never from the body.
    model_config = ConfigDict(extra="ignore")

    bio: Optional[Bio] = None
    birth_date: Optional[BirthDate] = None
    gender: Gender
    sexual_orientation: Optional[Orientation] = None
    # Photos are added only through /profile/upload-photo, which derives the storage
    # key server-side; never accept client-supplied keys here.
    tags: list[DbId] = Field(default_factory=list, max_length=100)


class UpdateProfileRequest(BaseModel):
    bio: Optional[Bio] = None
    birth_date: Optional[BirthDate] = None
    gender: Optional[Gender] = None
    sexual_orientation: Optional[Orientation] = None
    tags: Optional[list[DbId]] = Field(None, max_length=100)


class SetLocationRequest(BaseModel):
    """Either (latitude, longitude) for GPS consent, or city for manual entry."""
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    city: Optional[City] = None


class LocationResponse(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_label: Optional[str] = None


class SetProfilePicRequest(BaseModel):
    photo_id: DbId


class DeletePhotosRequest(BaseModel):
    photo_ids: list[DbId] = Field(..., min_length=1, max_length=50)


class ReorderPhotosRequest(BaseModel):
    # Cap well above the 5-photo limit; the exact-set check lives in the service.
    photo_ids: list[DbId] = Field(..., max_length=50)


class ProfileRequest(BaseModel):
    user_id: int


class TagResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class PhotoResponse(BaseModel):
    id: int
    user_id: int
    url: str
    order: int
    is_main: bool

    model_config = ConfigDict(from_attributes=True)


class ProfileResponse(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    username: str
    email: EmailStr
    bio: Optional[str] = None
    birth_date: Optional[datetime] = None
    gender: Optional[Gender] = None
    sexual_orientation: Optional[Orientation] = None
    profile_picture_id: Optional[int] = None
    fame_rating: float = 0.0
    tags: list[int] = Field(default_factory=list)
    photos: list[PhotoResponse] = Field(default_factory=list)
    views_count: int = 0
    likes_count: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_label: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
