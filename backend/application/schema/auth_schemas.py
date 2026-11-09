from application.schema.fields import PersonName
from pydantic import BaseModel, EmailStr, Field, validator
from datetime import datetime


class RegisterRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    username: str = Field(..., max_length=50)
    email: EmailStr = Field(...)
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)

    @validator("confirm_password")
    def passwords_match(cls, v, values):
        if "password" in values and v != values["password"]:
            raise ValueError("Passwords do not match")
        return v


class RegisterUserResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    username: str
    email: EmailStr
    created_at: datetime

    @validator("created_at", pre=True)
    def created_at_formatter(cls, v):
        return v.strftime("%Y-%m-%d %H:%M:%S")

    model_config = {"from_attributes": True}


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    model_config = {"from_attributes": True}


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)

    model_config = {"from_attributes": True}
