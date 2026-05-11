from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class BidFile(Base):
    """A file submitted by a buyer for a bid round."""
    __tablename__ = "bid_files"

    id = Column(Integer, primary_key=True, index=True)
    bid_round_id = Column(Integer, ForeignKey("bid_rounds.id"), nullable=False)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=True)

    status = Column(String, default="pending")  # pending | processing | processed | error
    error_message = Column(Text, nullable=True)
    lines_parsed = Column(Integer, default=0)
    lines_matched = Column(Integer, default=0)
    lines_exception = Column(Integer, default=0)

    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())  # tiebreaker
    processed_at = Column(DateTime(timezone=True), nullable=True)

    bid_round = relationship("BidRound", back_populates="bid_files")
    buyer = relationship("User", back_populates="bid_files")
    bid_lines = relationship("BidLine", back_populates="bid_file")
