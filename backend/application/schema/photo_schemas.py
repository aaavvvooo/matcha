from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PhotoResponse(BaseModel):
    id: int
    user_id: int
    url: str
    order: int
    is_main: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
