"""
Buyer-facing routes:
  - GET  /buyer/rounds                     — list open rounds assigned to this buyer
  - POST /buyer/rounds/{id}/bid            — upload a bid file
  - GET  /buyer/rounds/{id}/template       — download the bid template Excel
  - GET  /buyer/my-results                 — view won/lost results with fluffed prices
  - GET  /buyer/my-results/{round_id}      — results for a specific round
  - GET  /buyer/my-deals                   — all won deals
  - GET  /buyer/my-rounds                  — all rounds this buyer has been invited to
  - GET  /buyer/rounds/{id}/award-sheet    — download personal award sheet
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import text, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import require_buyer
from app.models.bid_round import BidRound
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.deal import Deal
from app.services.file_parser import parse_buyer_file
from app.services.export_service import export_buyer_award_sheet
from app.api.routes.notifications import create_notification

router = APIRouter(prefix="/buyer", tags=["buyer"])


@router.get("/rounds")
def list_open_rounds(db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """Open rounds assigned to this buyer via round_buyers table."""
    assigned_rows = db.execute(
        text("SELECT round_id, invite_status FROM round_buyers WHERE buyer_id = :bid"),
        {"bid": buyer.id},
    ).fetchall()
    assigned_map = {row.round_id: row.invite_status for row in assigned_rows}

    if not assigned_map:
        return []

    rounds = db.query(BidRound).filter(
        BidRound.status == "open",
        BidRound.id.in_(list(assigned_map.keys())),
    ).all()

    return [
        {
            "id": r.id,
            "name": r.name,
            "commodity": r.commodity,
            "customer": r.customer,
            "deadline": r.submission_deadline,
            "invite_status": assigned_map.get(r.id),
            "assigned": True,
        }
        for r in rounds
    ]


@router.get("/my-rounds")
def my_rounds(db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """All rounds this buyer has been invited to, across all statuses."""
    rows = db.execute(
        text("SELECT round_id, invite_status, invited_at FROM round_buyers WHERE buyer_id = :bid ORDER BY invited_at DESC"),
        {"bid": buyer.id},
    ).fetchall()

    if not rows:
        return []

    round_ids = [r.round_id for r in rows]

    # Bulk-fetch all rounds in one query
    rounds = {r.id: r for r in db.query(BidRound).filter(BidRound.id.in_(round_ids)).all()}

    # Bulk-fetch line counts in two queries instead of 2×N
    line_counts = {
        row.bid_round_id: row.cnt
        for row in db.query(BidLine.bid_round_id, func.count().label("cnt"))
        .filter(BidLine.bid_round_id.in_(round_ids), BidLine.buyer_id == buyer.id)
        .group_by(BidLine.bid_round_id)
        .all()
    }
    won_counts = {
        row.bid_round_id: row.cnt
        for row in db.query(BidLine.bid_round_id, func.count().label("cnt"))
        .filter(BidLine.bid_round_id.in_(round_ids), BidLine.buyer_id == buyer.id, BidLine.is_winner == True)
        .group_by(BidLine.bid_round_id)
        .all()
    }

    result = []
    for row in rows:
        r = rounds.get(row.round_id)
        if r:
            result.append({
                "id": r.id,
                "name": r.name,
                "commodity": r.commodity,
                "status": r.status,
                "deadline": r.submission_deadline,
                "invite_status": row.invite_status,
                "invited_at": row.invited_at,
                "lines_submitted": line_counts.get(r.id, 0),
                "lines_won": won_counts.get(r.id, 0),
            })
    return result


@router.post("/rounds/{round_id}/bid")
async def submit_bid(round_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status != "open":
        raise HTTPException(400, "This round is not accepting bids")

    # Enforce assignment: buyer must be in round_buyers
    assigned = db.execute(
        text("SELECT 1 FROM round_buyers WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": round_id, "bid": buyer.id},
    ).fetchone()
    if not assigned:
        raise HTTPException(403, "You are not assigned to this round")

    # Check deadline
    if r.submission_deadline and datetime.now(timezone.utc) > r.submission_deadline:
        raise HTTPException(400, "Submission deadline has passed")

    content = await file.read()
    file_size = len(content)

    bid_file = BidFile(
        bid_round_id=round_id,
        buyer_id=buyer.id,
        filename=file.filename,
        file_path=f"/tmp/{round_id}_{buyer.id}_{file.filename}",
        file_size_bytes=file_size,
        status="processing",
    )
    db.add(bid_file)
    db.flush()

    try:
        rows = parse_buyer_file(content, file.filename)
    except ValueError as e:
        bid_file.status = "error"
        bid_file.error_message = str(e)
        db.commit()
        raise HTTPException(400, str(e))

    for row in rows:
        line = BidLine(
            bid_file_id=bid_file.id,
            bid_round_id=round_id,
            buyer_id=buyer.id,
            **row,
        )
        db.add(line)

    bid_file.status = "processed"
    bid_file.lines_parsed = len(rows)
    bid_file.processed_at = datetime.now(timezone.utc)

    # Update buyer activity
    buyer.last_bid_at = datetime.now(timezone.utc)
    buyer.total_rounds_participated += 1

    # Mark buyer as having uploaded in the participation tracker
    db.execute(
        text("UPDATE round_buyers SET invite_status='uploaded' WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": round_id, "bid": buyer.id},
    )

    db.commit()
    create_notification(
        db,
        title=f"New bid received from {buyer.company_name or buyer.full_name}",
        body=f"{len(rows)} lines submitted for round #{round_id}",
        category="info",
        link=f"/admin/rounds/{round_id}",
    )
    return {"message": f"Submitted {len(rows)} line items", "bid_file_id": bid_file.id}


@router.get("/my-results")
def my_results(db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    lines = (
        db.query(BidLine)
        .filter(BidLine.buyer_id == buyer.id, BidLine.match_status == "matched")
        .all()
    )

    results = []
    for l in lines:
        master = db.query(MasterItem).filter(MasterItem.id == l.master_item_id).first()
        if l.is_winner:
            results.append({
                "part_number": master.part_number if master else l.raw_part_number,
                "description": master.description if master else l.description,
                "outcome": "WON",
                "your_price": l.unit_price,
                "winning_price": l.unit_price,
            })
        elif l.fluffed_loss_price:
            # Buyer only sees the fluffed price, never the real winning price
            results.append({
                "part_number": master.part_number if master else l.raw_part_number,
                "description": master.description if master else l.description,
                "outcome": "LOST",
                "your_price": l.unit_price,
                "winning_price": l.fluffed_loss_price,  # intentionally fluffed
            })

    return {"results": results, "won": len([r for r in results if r["outcome"] == "WON"]), "lost": len([r for r in results if r["outcome"] == "LOST"])}


@router.get("/rounds/{round_id}/award-sheet")
def download_my_award_sheet(round_id: int, db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """Buyer downloads their own award sheet (wins + loss notices with fluffed prices)."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status not in ("complete",):
        raise HTTPException(400, "Results not yet available for this round")

    data = export_buyer_award_sheet(db, round_id, buyer.id)
    filename = f"my_results_{r.name.replace(' ', '_')}_{round_id}.xlsx"
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/rounds/{round_id}/template")
def download_template(round_id: int, db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """Buyer downloads the bid template for a round."""
    from app.services.template_generator import generate_bid_template
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if not r.master_file_uploaded:
        raise HTTPException(400, "Template not yet available — master file not uploaded")
    data = generate_bid_template(db, round_id)
    filename = f"bid_template_{r.name.replace(' ', '_')}.xlsx"
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/my-results/{round_id}")
def my_results_for_round(round_id: int, db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    lines = (
        db.query(BidLine)
        .filter(BidLine.bid_round_id == round_id, BidLine.buyer_id == buyer.id, BidLine.match_status == "matched")
        .all()
    )
    results = []
    for l in lines:
        master = db.query(MasterItem).filter(MasterItem.id == l.master_item_id).first()
        entry = {
            "part_number": master.part_number if master else l.raw_part_number,
            "description": master.description if master else l.description,
            "quantity": l.quantity,
            "outcome": "WON" if l.is_winner else "LOST",
            "your_price": l.unit_price,
            "winning_price": l.unit_price if l.is_winner else l.fluffed_loss_price,
        }
        results.append(entry)
    return {
        "round_id": round_id,
        "results": results,
        "won": sum(1 for r in results if r["outcome"] == "WON"),
        "lost": sum(1 for r in results if r["outcome"] == "LOST"),
    }


@router.get("/my-deals")
def my_deals(db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    deals = db.query(Deal).filter(Deal.winning_buyer_id == buyer.id).order_by(Deal.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "part_number": d.part_number,
            "description": d.description,
            "quantity": d.quantity,
            "winning_price": d.winning_price,
            "total_value": d.total_value,
            "status": d.status,
        }
        for d in deals
    ]
