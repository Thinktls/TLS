from sqlalchemy import Column, Index, Integer, String, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class MasterItem(Base):
    """One line in the ThinkTLS master list — the source of truth for what's being bid."""
    __tablename__ = "master_items"
    __table_args__ = (
        # d4e5f6 migration already created: ix_master_items_bid_round_id
        Index("ix_master_items_round_pn_norm", "bid_round_id", "part_number_normalized"),
    )

    id = Column(Integer, primary_key=True, index=True)
    bid_round_id = Column(Integer, ForeignKey("bid_rounds.id"), nullable=False)

    part_number = Column(String, nullable=False, index=True)
    part_number_normalized = Column(String, nullable=False, index=True)  # cleaned version
    description = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    quantity = Column(Integer, default=1)
    reserve_price = Column(Float, nullable=True)  # floor price; null = no floor
    category = Column(String, nullable=True)
    extra_columns = Column(JSON, nullable=True)  # non-standard spec cols from original upload (CPU, Memory, Grade, etc.)

    row_number = Column(Integer, nullable=True)  # original Excel row

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bid_round = relationship("BidRound", back_populates="master_items")
    bid_lines = relationship("BidLine", back_populates="master_item")
