from pydantic import BaseModel, validator, Field
from datetime import datetime

class TokenInfo(BaseModel):
    id: int
    user_id: int
    token: str
    token_type: str
    created_at: datetime
    expires_at: datetime


    @validator("created_at", pre=True)
    def created_at_formatter(cls, v):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    
    model_config = {
        "from_attributes": True
    }