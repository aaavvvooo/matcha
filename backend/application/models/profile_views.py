from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from application.database import Base


class ProfileView(Base):
    __tablename__ = "profile_views"

    viewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    viewed_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    viewed_at = Column(DateTime(timezone=True), server_default=func.now())
