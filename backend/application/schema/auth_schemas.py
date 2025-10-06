from pydantic import BaseModel, EmailStr, Field

class RegisterRequest(BaseModel):
    full_name: str = Field(..., max_length=100)
    username: str = Field(..., max_length=50)
    email: EmailStr = Field(...)
    password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)