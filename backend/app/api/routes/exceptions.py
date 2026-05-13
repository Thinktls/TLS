"""
Exception queue — admin reviews and resolves flagged bid lines.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
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


class BulkResolveRequest(BaseModel):
    action: str  # approve_suggested | reject_all
    line_ids: List[int] | None = None  # None = all unresolved in round


def _serialize_line(l: BidLine, db: Session) -> dict:
    buyer = db.query(User).filter(User.id == l.buyer_id).first()
    master = db.query(MasterItem).filter(MasterItem.id == l.master_item_id).first() if l.master_item_id else None
    return {
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
        "suggested_match": {
            "id": master.id,
            "part_number": master.part_number,
            "description": master.description,
        } if master else None,
        "ai_match_suggestion": l.ai_match_suggestion,
        "ai_match_confidence": l.ai_match_confidence,
        "resolved": l.exception_resolved,
        "resolved_by": l.exception_resolved_by,
    }


@router.get("/rounds/{round_id}")
def list_exceptions(
    round_id: int,
    exception_type: Optional[str] = Query(None),
    resolved: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(BidLine).filter(
        BidLine.bid_round_id == round_id,
        BidLine.match_status == "exception",
    )
    if exception_type and exception_type != "all":
        q = q.filter(BidLine.exception_type == exception_type)
    if resolved is not None:
        q = q.filter(BidLine.exception_resolved == resolved)
    lines = q.all()
    return [_serialize_line(l, db) for l in lines]


@router.get("/rounds/{round_id}/stats")
def exception_stats(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    all_lines = db.query(BidLine).filter(
        BidLine.bid_round_id == round_id,
        BidLine.match_status == "exception",
    ).all()
    stats: dict = {"total": len(all_lines), "resolved": 0, "unresolved": 0, "by_type": {}}
    for l in all_lines:
        if l.exception_resolved:
            stats["resolved"] += 1
        else:
            stats["unresolved"] += 1
        t = l.exception_type or "unknown"
        stats["by_type"][t] = stats["by_type"].get(t, 0) + 1
    # ai suggestions available (confidence stored)
    stats["ai_suggestions_available"] = sum(
        1 for l in all_lines if l.ai_match_confidence and l.ai_match_confidence >= 85 and not l.exception_resolved
    )
    return stats


@router.get("/rounds/{round_id}/search-master")
def search_master_items(
    round_id: int,
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Fuzzy search master items for manual remapping."""
    query = f"%{q.lower()}%"
    items = (
        db.query(MasterItem)
        .filter(
            MasterItem.bid_round_id == round_id,
            (MasterItem.part_number_normalized.ilike(query)) | (MasterItem.description.ilike(query)),
        )
        .limit(15)
        .all()
    )
    return [
        {
            "id": m.id,
            "part_number": m.part_number,
            "part_number_normalized": m.part_number_normalized,
            "description": m.description,
            "quantity": m.quantity,
        }
        for m in items
    ]


@router.patch("/{line_id}/resolve")
def resolve_exception(
    line_id: int,
    req: ResolveRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
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
    elif req.action == "approve_ai":
        # Accept the AI suggestion — find master item by part number
        if not line.ai_match_suggestion:
            raise HTTPException(400, "No AI suggestion available for this line")
        master = (
            db.query(MasterItem)
            .filter(
                MasterItem.bid_round_id == line.bid_round_id,
                MasterItem.part_number_normalized == line.ai_match_suggestion,
            )
            .first()
        )
        if master:
            line.master_item_id = master.id
        line.match_method = "ai"
        line.match_score = line.ai_match_confidence or 90.0
        line.match_status = "matched"

    line.exception_resolved = True
    line.exception_resolved_by = admin.email
    if req.notes:
        line.exception_notes = req.notes

    db.commit()
    return {"status": "resolved", "new_match_status": line.match_status}


@router.post("/rounds/{round_id}/bulk-resolve")
def bulk_resolve(
    round_id: int,
    req: BulkResolveRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    approve_suggested — accept AI suggestions with confidence >= 85 on specified (or all) lines.
    reject_all — mark specified (or all) unresolved lines as rejected.
    """
    q = db.query(BidLine).filter(
        BidLine.bid_round_id == round_id,
        BidLine.match_status == "exception",
        BidLine.exception_resolved == False,
    )
    if req.line_ids:
        q = q.filter(BidLine.id.in_(req.line_ids))

    lines = q.all()
    resolved_count = 0

    for line in lines:
        if req.action == "approve_suggested":
            if not (line.ai_match_confidence and line.ai_match_confidence >= 85):
                continue
            master = (
                db.query(MasterItem)
                .filter(
                    MasterItem.bid_round_id == round_id,
                    MasterItem.part_number_normalized == line.ai_match_suggestion,
                )
                .first()
            )
            if master:
                line.master_item_id = master.id
            line.match_method = "ai"
            line.match_score = line.ai_match_confidence
            line.match_status = "matched"
            line.exception_resolved = True
            line.exception_resolved_by = admin.email
            resolved_count += 1

        elif req.action == "reject_all":
            line.exception_type = "rejected"
            line.exception_resolved = True
            line.exception_resolved_by = admin.email
            resolved_count += 1

    db.commit()
    return {"resolved": resolved_count, "action": req.action}
