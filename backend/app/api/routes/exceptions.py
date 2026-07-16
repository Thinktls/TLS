"""
Exception queue — admin reviews and resolves flagged bid lines.
"""
from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.core.config import settings
from app.db.session import get_db
from app.core.security import require_admin
from app.models.bid_line import BidLine
from app.models.bid_round import BidRound
from app.models.master_item import MasterItem
from app.models.user import User
from app.services.email_service import send_lines_removed


def _notify_lines_removed(background_tasks: BackgroundTasks, db: Session, round_id: int, lines: list[BidLine]) -> None:
    """Email each affected buyer that their line(s) were removed from the round.

    Removing a line silently pulled a buyer's price out of the running with no word to them —
    for a flagged price typo that's exactly when they'd want the chance to correct it. Grouped
    into one email per buyer so a bulk reject can't fire hundreds of separate messages.
    """
    if not lines:
        return
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    round_name = r.name if r else f"Round #{round_id}"
    buyer_ids = {l.buyer_id for l in lines if l.buyer_id}
    if not buyer_ids:
        return
    buyers = {
        b.id: b for b in db.query(User)
        .filter(User.id.in_(buyer_ids), User.is_active == True).all()
    }
    portal_url = f"{settings.FRONTEND_URL}/portal/submission?round={round_id}"
    by_buyer: dict[int, list] = {}
    for l in lines:
        by_buyer.setdefault(l.buyer_id, []).append({
            "part_number": l.raw_part_number,
            "price": l.unit_price,
            "reason": l.exception_notes,
        })
    for buyer_id, items in by_buyer.items():
        buyer = buyers.get(buyer_id)
        if not buyer:
            continue
        background_tasks.add_task(
            send_lines_removed, buyer.email, buyer.full_name, round_name, items, portal_url
        )

router = APIRouter(prefix="/exceptions", tags=["exceptions"])


class ResolveRequest(BaseModel):
    action: str  # approve_match | reject | remap
    new_master_item_id: int | None = None
    notes: str | None = None


class BulkResolveRequest(BaseModel):
    action: str  # approve_suggested | reject_all
    line_ids: List[int] | None = None  # None = all unresolved in round


def _serialize_line(l: BidLine) -> dict:
    buyer = l.buyer       # pre-loaded via joinedload in calling query
    master = l.master_item  # pre-loaded via joinedload in calling query
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
    q = (
        db.query(BidLine)
        .filter(BidLine.bid_round_id == round_id, BidLine.match_status == "exception")
        .options(joinedload(BidLine.buyer), joinedload(BidLine.master_item))
    )
    if exception_type and exception_type != "all":
        q = q.filter(BidLine.exception_type == exception_type)
    if resolved is not None:
        q = q.filter(BidLine.exception_resolved == resolved)
    return [_serialize_line(l) for l in q.all()]


@router.get("/rounds/{round_id}/stats")
def exception_stats(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    base = (BidLine.bid_round_id == round_id, BidLine.match_status == "exception")
    counts = db.query(
        func.count().label("total"),
        func.count(case((BidLine.exception_resolved == True, 1))).label("resolved"),
        func.count(case((BidLine.exception_resolved == False, 1))).label("unresolved"),
        func.count(case((
            (BidLine.ai_match_confidence >= 85) & (~BidLine.exception_resolved),
            1,
        ))).label("ai_available"),
    ).filter(*base).one()

    by_type = {
        (t or "unknown"): c
        for t, c in db.query(BidLine.exception_type, func.count())
        .filter(*base)
        .group_by(BidLine.exception_type)
        .all()
    }

    return {
        "total": counts.total,
        "resolved": counts.resolved,
        "unresolved": counts.unresolved,
        "by_type": by_type,
        "ai_suggestions_available": counts.ai_available,
    }


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
    background_tasks: BackgroundTasks,
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
    # Tell the buyer once the removal is actually persisted, never before.
    if req.action == "reject":
        _notify_lines_removed(background_tasks, db, line.bid_round_id, [line])
    return {
        "status": "resolved",
        "new_match_status": line.match_status,
        "buyer_notified": req.action == "reject",
    }


@router.post("/rounds/{round_id}/bulk-resolve")
def bulk_resolve(
    round_id: int,
    req: BulkResolveRequest,
    background_tasks: BackgroundTasks,
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
    rejected: list[BidLine] = []   # buyers of these get one grouped "line removed" email

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
            rejected.append(line)
            resolved_count += 1

    db.commit()
    # One grouped email per affected buyer, sent only after the rejections are persisted.
    if rejected:
        _notify_lines_removed(background_tasks, db, round_id, rejected)
    return {
        "resolved": resolved_count,
        "action": req.action,
        "buyers_notified": len({l.buyer_id for l in rejected}) if rejected else 0,
    }
