from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum, Table, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
import enum

# Many-to-many: which buyers are assigned to which rounds
round_buyers = Table(
    "round_buyers",
    Base.metadata,
    Column("round_id", Integer, ForeignKey("bid_rounds.id"), primary_key=True),
    Column("buyer_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("invited_at", DateTime(timezone=True), server_default=func.now()),
    Column("invite_status", String, default="pending"),  # pending | sent | uploaded | processing | ready | error
)


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
    # Opt-in automation (default OFF): when a round finishes processing with NO unresolved
    # exceptions, auto-approve every deal — which sends buyers their result emails. Only ever
    # true when an admin explicitly enabled it for this round, because those emails can't be
    # recalled. A round with any unresolved exception always stops for manual review.
    auto_approve_enabled = Column(Boolean, default=False, nullable=False, server_default="false")

    # Master file tracking
    master_file_uploaded = Column(Boolean, default=False)
    master_file_path = Column(String, nullable=True)
    total_line_items = Column(Integer, default=0)

    customer = Column(String, nullable=True)  # end-customer name for this bid
    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Lifecycle timestamps — set when admin performs each action
    master_file_uploaded_at = Column(DateTime(timezone=True), nullable=True)
    opened_at               = Column(DateTime(timezone=True), nullable=True)
    closed_at               = Column(DateTime(timezone=True), nullable=True)
    processing_started_at   = Column(DateTime(timezone=True), nullable=True)
    completed_at            = Column(DateTime(timezone=True), nullable=True)

    bid_files = relationship("BidFile", back_populates="bid_round")
    master_items = relationship("MasterItem", back_populates="bid_round")
    deals = relationship("Deal", back_populates="bid_round")
    assigned_buyers = relationship("User", secondary="round_buyers", back_populates="assigned_rounds")
