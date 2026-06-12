from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from application.database import Base


class Report(Base):
    __tablename__ = "reports"

    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    reported_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
