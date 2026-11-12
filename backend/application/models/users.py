from sqlalchemy import Column, Integer, String, Boolean, DateTime, Index, text
from sqlalchemy.sql import func
from application.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False, server_default="")
    is_validated = Column(Boolean, default=False, server_default="false")
    is_superuser = Column(Boolean, default=False, server_default="false")
    is_online = Column(Boolean, default=False, server_default="false")
    last_seen = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    # Bumped on password reset; JWTs carry it as "ver" and die once it moves on.
    token_version = Column(Integer, nullable=False, default=0, server_default=text("0"))

    __table_args__ = (
        # Email and username are unique ignoring case (lookups compare lower() too).
        Index("uq_users_email_lower", func.lower(email), unique=True),
        Index("uq_users_username_lower", func.lower(username), unique=True),
    )
