from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func, text
from application.database import Base


class RefreshToken(Base):
    """The refresh tokens of signed-in devices, keyed by the immutable user id (never the username)."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("uq_refresh_tokens_token_hash", "token_hash", unique=True),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE", name="fk_refresh_tokens_user_id"),
        nullable=False, index=True,
    )
    # The tokens one device rotates through share a session.
    session_id = Column(UUID, server_default=text("gen_random_uuid()"), nullable=False)
    token_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
