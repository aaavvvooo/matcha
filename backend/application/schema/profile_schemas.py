from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional


class SetProfileRequest(BaseModel):
    user_id: int
    bio: str = Field(None, max_length=500)
    birth_date: datetime = Field(None)
    gender: str = Field(None, max_length=20)
    sexual_orientation: str = Field(None, max_length=20)
    tags: list[int] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)


class UpdateProfileRequest(BaseModel):
    bio: Optional[str] = Field(None, max_length=500)
    birth_date: Optional[datetime] = None
    gender: Optional[str] = Field(None, max_length=20)
    sexual_orientation: Optional[str] = Field(None, max_length=20)


class SetProfilePicRequest(BaseModel):
    photo_id: int


class AddPhotosRequest(BaseModel):
    photos: list[str] = Field(..., min_length=1, max_length=5)


class DeletePhotosRequest(BaseModel):
    photo_ids: list[int] = Field(..., min_length=1)


class AddTagsRequest(BaseModel):
    tag_ids: list[int] = Field(..., min_length=1)


class DeleteTagsRequest(BaseModel):
    tag_ids: list[int] = Field(..., min_length=1)


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
    full_name: str
    username: str
    email: EmailStr
    bio: Optional[str] = None
    birth_date: Optional[datetime] = None
    gender: Optional[str] = None
    sexual_orientation: Optional[str] = None
    profile_picture_id: Optional[int] = None
    fame_rating: float = 0.0
    tags: list[int] = Field(default_factory=list)
    photos: list[PhotoResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
