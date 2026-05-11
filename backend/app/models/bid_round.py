from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
import enum


class RoundStatus(str, enum.Enum):
    draft = "draft"
    open = "open"
    closed = "closed"
    processing = "processing"
    complete = "complete"


class Commodity(str, enum.Enum):
    laptops = "laptops"
    desktops = "desktops"
    servers = "servers"
    networking = "networking"
    storage = "storage"
    peripherals = "peripherals"
    other = "other"


class BidRound(Base):
    __tablename__ = "bid_rounds"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # e.g. "May 2026 Round 2 - Laptops"
    commodity = Column(String, nullable=False)
    status = Column(String, default="draft")  # draft | open | closed | processing | complete

    submission_deadline = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    reserve_price_enabled = Column(Boolean, default=False)

    # Master file tracking
    master_file_uploaded = Column(Boolean, default=False)
    master_file_path = Column(String, nullable=True)
    total_line_items = Column(Integer, default=0)

    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    bid_files = relationship("BidFile", back_populates="bid_round")
    master_items = relationship("MasterItem", back_populates="bid_round")
    deals = relationship("Deal", back_populates="bid_round")
