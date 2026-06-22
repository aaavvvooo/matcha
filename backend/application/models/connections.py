from sqlalchemy import Column, Integer, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.sql import func
from application.database import Base


class Connection(Base):
    __tablename__ = "connections"
    __table_args__ = (CheckConstraint("user_a_id < user_b_id", name="ck_connections_ordered"),)

    user_a_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    user_b_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
