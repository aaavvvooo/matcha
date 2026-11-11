from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.sql import func
from application.database import Base


class Date(Base):
    """A date proposal between two connected users (DESIGN.md §4). All timestamps are UTC instants."""

    __tablename__ = "dates"
    __table_args__ = (
        CheckConstraint("proposer_id <> invitee_id", name="ck_dates_distinct_users"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'cancelled')", name="ck_dates_status"
        ),
        Index("ix_dates_proposer", "proposer_id", "scheduled_at"),
        Index("ix_dates_invitee", "invitee_id", "scheduled_at"),
        Index(
            "ix_dates_reminder", "scheduled_at",
            postgresql_where=text("status = 'accepted' AND reminder_sent_at IS NULL"),
        ),
    )

    id = Column(Integer, primary_key=True)
    proposer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    invitee_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(100), nullable=False)
    place = Column(String(200), nullable=False)
    note = Column(String(500), nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(20), nullable=False, server_default="pending")
    reminder_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
