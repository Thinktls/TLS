from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="buyer")  # admin | buyer
    is_active = Column(Boolean, default=True)
    company_name = Column(String, nullable=True)

    # Buyer-specific fields
    fluff_percentage = Column(Float, default=3.5)  # per-buyer fluff override
    last_bid_at = Column(DateTime(timezone=True), nullable=True)
    total_rounds_participated = Column(Integer, default=0)
    buyer_score = Column(Float, default=0.0)  # gamification score

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    bid_files = relationship("BidFile", back_populates="buyer")
    bid_lines = relationship("BidLine", back_populates="buyer")
