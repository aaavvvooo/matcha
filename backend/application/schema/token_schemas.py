from pydantic import BaseModel, field_serializer, Field
from datetime import datetime
from typing import Optional

from application.schema.fields import LoginIdentifier


class TokenInfo(BaseModel):
    id: int
    user_id: int
    token: str
    token_type: str
    created_at: datetime
    expires_at: datetime
    used: bool
    new_email: Optional[str] = None

    @field_serializer("created_at")
    def created_at_formatter(cls, v):
        return v.strftime("%Y-%m-%d %H:%M:%S")

    model_config = {"from_attributes": True}


class VerificationToken(BaseModel):
    token: str = Field(..., max_length=64)

    model_config = {"from_attributes": True}


class ForgetPasswordRequest(BaseModel):
    username_or_email: LoginIdentifier

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
