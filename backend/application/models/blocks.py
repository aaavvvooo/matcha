from sqlalchemy import Column, Integer, ForeignKey
from application.database import Base


class Block(Base):
    __tablename__ = "blocks"

    blocker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
