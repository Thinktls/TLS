from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class Deal(Base):
    """A finalized deal — one per winning bid line, created after admin approval."""
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    bid_round_id = Column(Integer, ForeignKey("bid_rounds.id"), nullable=False)
    master_item_id = Column(Integer, ForeignKey("master_items.id"), nullable=False)
    winning_buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    winning_bid_line_id = Column(Integer, ForeignKey("bid_lines.id"), nullable=False)

    part_number = Column(String, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    winning_price = Column(Float, nullable=False)      # real price
    total_value = Column(Float, nullable=False)

    # Razor ERP
    razor_deal_id = Column(String, nullable=True)
    razor_pushed_at = Column(DateTime(timezone=True), nullable=True)
    razor_push_status = Column(String, default="pending")  # pending | success | failed | csv_exported

    # Admin approval
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="pending_approval")  # pending_approval | approved | rejected | pushed_to_razor

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bid_round = relationship("BidRound", back_populates="deals")
    master_item = relationship("MasterItem")
    winning_buyer = relationship("User")
    winning_bid_line = relationship("BidLine")
