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
    fluff_percentage = Column(Float, default=3.5)
    fluff_enabled = Column(Boolean, default=True)
    last_bid_at = Column(DateTime(timezone=True), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)  # set on each successful login; null = never logged in (invite not yet accepted)
    last_invited_date = Column(DateTime(timezone=True), nullable=True)
    last_win_date = Column(DateTime(timezone=True), nullable=True)
    total_rounds_participated = Column(Integer, default=0)
    buyer_score = Column(Float, default=0.0)

    # Scorer fields (recalculated after each deal approval)
    win_rate = Column(Float, default=0.0)          # lines_won / lines_bid
    total_lines_won = Column(Integer, default=0)
    total_lines_bid = Column(Integer, default=0)
    total_margin_contribution = Column(Float, default=0.0)  # sum(awarded_price - reserve_price)
    score_updated_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    bid_files = relationship("BidFile", back_populates="buyer")
    bid_lines = relationship("BidLine", back_populates="buyer")
    assigned_rounds = relationship("BidRound", secondary="round_buyers", back_populates="assigned_buyers")
