from sqlalchemy import Column, Index, Integer, String, Float, ForeignKey, DateTime, Boolean, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class BidLine(Base):
    """A single priced line item submitted by a buyer."""
    __tablename__ = "bid_lines"
    __table_args__ = (
        # d4e5f6 migration already created: ix_bid_lines_round_match_status, ix_bid_lines_bid_round_id, ix_bid_lines_buyer_id
        Index("ix_bid_lines_round_buyer_id",  "bid_round_id", "buyer_id"),
        Index("ix_bid_lines_round_winner",    "bid_round_id", "is_winner"),
        Index("ix_bid_lines_master_item_id",  "master_item_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    bid_file_id = Column(Integer, ForeignKey("bid_files.id"), nullable=False)
    bid_round_id = Column(Integer, ForeignKey("bid_rounds.id"), nullable=False)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    master_item_id = Column(Integer, ForeignKey("master_items.id"), nullable=True)

    # What the buyer submitted
    raw_part_number = Column(String, nullable=False)
    normalized_part_number = Column(String, nullable=True)
    description = Column(String, nullable=True)
    unit_price = Column(Float, nullable=True)
    quantity = Column(Integer, nullable=True)
    total_price = Column(Float, nullable=True)

    # Matching
    match_method = Column(String, nullable=True)  # exact | fuzzy | ai | unmatched
    match_score = Column(Float, nullable=True)     # 0-100 for fuzzy/AI matches
    match_status = Column(String, default="pending")  # pending | matched | exception | review

    # Exception
    exception_type = Column(String, nullable=True)  # unmatched | partial_match | duplicate | overbid | below_reserve | price_anomaly | no_bids | bad_format
    exception_notes = Column(Text, nullable=True)
    exception_resolved = Column(Boolean, default=False)
    exception_resolved_by = Column(String, nullable=True)

    # Winner fields
    is_winner = Column(Boolean, default=False)
    real_winning_price = Column(Float, nullable=True)     # actual price stored in audit trail
    fluffed_loss_price = Column(Float, nullable=True)     # what losing buyer was told (real + fluff %)

    # AI fuzzy matcher
    ai_match_suggestion = Column(String, nullable=True)   # suggested part number from Claude
    ai_match_confidence = Column(Float, nullable=True)    # 0-100 confidence score

    # Anomaly detection
    z_score = Column(Float, nullable=True)
    is_anomaly = Column(Boolean, default=False)
    anomaly_reason = Column(String, nullable=True)  # z_score | price_too_high | price_too_low

    row_number = Column(Integer, nullable=True)  # original Excel row for traceability
    extra_columns = Column(JSON, nullable=True)  # spec columns from the original file (CPU, Memory, Grade, etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bid_file = relationship("BidFile", back_populates="bid_lines")
    bid_round = relationship("BidRound")
    buyer = relationship("User", back_populates="bid_lines")
    master_item = relationship("MasterItem", back_populates="bid_lines")
