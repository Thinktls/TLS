from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.db.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_role = Column(String, nullable=False, default="admin")  # admin | buyer
    recipient_id = Column(Integer, nullable=True)  # None = broadcast to all admins
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    category = Column(String, nullable=False, default="info")  # info | warning | error | success
    link = Column(String, nullable=True)   # optional in-app href
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
