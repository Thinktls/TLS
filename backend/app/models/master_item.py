from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class MasterItem(Base):
    """One line in the ThinkTLS master list — the source of truth for what's being bid."""
    __tablename__ = "master_items"

    id = Column(Integer, primary_key=True, index=True)
    bid_round_id = Column(Integer, ForeignKey("bid_rounds.id"), nullable=False)

    part_number = Column(String, nullable=False, index=True)
    part_number_normalized = Column(String, nullable=False, index=True)  # cleaned version
    description = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    quantity = Column(Integer, default=1)
    reserve_price = Column(Float, nullable=True)  # floor price; null = no floor
    category = Column(String, nullable=True)

    row_number = Column(Integer, nullable=True)  # original Excel row

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bid_round = relationship("BidRound", back_populates="master_items")
    bid_lines = relationship("BidLine", back_populates="master_item")
