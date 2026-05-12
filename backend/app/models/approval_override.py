from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class ApprovalOverride(Base):
    """Audit log of admin overrides during deal approval."""
    __tablename__ = "approval_overrides"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    bid_round_id = Column(Integer, ForeignKey("bid_rounds.id"), nullable=False)
    admin_user = Column(String, nullable=False)       # email of admin who made override
    field_changed = Column(String, nullable=False)    # "winning_buyer" | "unit_price" | "quantity"
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    reason_note = Column(Text, nullable=False)        # mandatory justification
    overridden_at = Column(DateTime(timezone=True), server_default=func.now())

    deal = relationship("Deal")
