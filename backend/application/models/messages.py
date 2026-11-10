from sqlalchemy import Column, Index, Integer, Text, Boolean, DateTime, ForeignKey, text
from sqlalchemy.sql import func
from application.database import Base


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_pair", "sender_id", "receiver_id", "id"),
        Index("ix_messages_unread", "receiver_id", "sender_id", postgresql_where=text("is_read = false")),
    )

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, server_default="false")
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
