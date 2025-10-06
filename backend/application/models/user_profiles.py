from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from application.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), unique=True, index=True, nullable=False)
    bio = Column(String, nullable=True)
    birth_date = Column(DateTime(timezone=True), nullable=True)
    gender = Column(String, nullable=True)
    sexual_orientation = Column(String, nullable=True)
    profile_picture_id = Column(Integer, ForeignKey('photos.id'), nullable=True)
    fame_rating = Column(Float, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())