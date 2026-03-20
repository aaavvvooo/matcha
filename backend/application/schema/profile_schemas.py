from pydantic import BaseModel, EmailStr, Field, validator
from datetime import datetime


class SetProfileRequest(BaseModel):
    user_id: int
    bio: str = Field(None, max_length=500)
    birth_date: datetime = Field(None)
    gender: str = Field(None, max_length=20)
    sexual_orientation: str = Field(None, max_length=20)
    tags: list[int] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)


class ProfileRequest(BaseModel):
    user_id: int
    
    
class ProfileResponse(BaseModel):
    user_id: int
    full_name: str
    username: str
    email: EmailStr
    bio: str
    birth_date: datetime
    gender: str
    sexual_orientation: str
    profile_picture_id: int
    fame_rating: float
    tags: list[int]
    photos: list[str]