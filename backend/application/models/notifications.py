from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from application.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    from_user = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_read = Column(Boolean, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
