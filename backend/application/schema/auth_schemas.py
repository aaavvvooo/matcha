from application.schema.fields import Email, Password, PersonName, Username
from pydantic import BaseModel, EmailStr, Field, validator
from datetime import datetime


class RegisterRequest(BaseModel):
    first_name: PersonName
    last_name: PersonName
    username: Username
    email: Email
    password: Password
    confirm_password: Password

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
    token: str = Field(..., max_length=64)
    password: Password

    model_config = {"from_attributes": True}
