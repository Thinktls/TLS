"""
Exception queue — admin reviews and resolves flagged bid lines.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_admin
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.user import User

router = APIRouter(prefix="/exceptions", tags=["exceptions"])


class ResolveRequest(BaseModel):
    action: str  # approve_match | reject | remap
    new_master_item_id: int | None = None
    notes: str | None = None


@router.get("/rounds/{round_id}")
def list_exceptions(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    lines = (
        db.query(BidLine)
        .filter(BidLine.bid_round_id == round_id, BidLine.match_status == "exception")
        .all()
    )
    result = []
    for l in lines:
        buyer = db.query(User).filter(User.id == l.buyer_id).first()
        master = db.query(MasterItem).filter(MasterItem.id == l.master_item_id).first() if l.master_item_id else None
        result.append({
            "id": l.id,
            "raw_part_number": l.raw_part_number,
            "normalized_part_number": l.normalized_part_number,
            "description": l.description,
            "unit_price": l.unit_price,
            "exception_type": l.exception_type,
            "exception_notes": l.exception_notes,
            "match_score": l.match_score,
            "match_method": l.match_method,
            "buyer_name": buyer.full_name if buyer else "",
            "buyer_company": buyer.company_name if buyer else "",
            "suggested_match": {"id": master.id, "part_number": master.part_number, "description": master.description} if master else None,
            "resolved": l.exception_resolved,
        })
    return result


@router.patch("/{line_id}/resolve")
def resolve_exception(line_id: int, req: ResolveRequest, db: Session = Depends(get_db), admin=Depends(require_admin)):
    line = db.query(BidLine).filter(BidLine.id == line_id).first()
    if not line:
        raise HTTPException(404, "Bid line not found")

    if req.action == "approve_match":
        line.match_status = "matched"
    elif req.action == "reject":
        line.match_status = "exception"
        line.exception_type = "rejected"
    elif req.action == "remap":
        if not req.new_master_item_id:
            raise HTTPException(400, "new_master_item_id required for remap")
        new_master = db.query(MasterItem).filter(MasterItem.id == req.new_master_item_id).first()
        if not new_master:
            raise HTTPException(404, "Master item not found")
        line.master_item_id = req.new_master_item_id
        line.match_method = "manual"
        line.match_score = 100.0
        line.match_status = "matched"

    line.exception_resolved = True
    line.exception_resolved_by = admin.email
    if req.notes:
        line.exception_notes = req.notes

    db.commit()
    return {"status": "resolved", "new_match_status": line.match_status}
