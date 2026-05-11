"""
Buyer-facing routes:
  - GET  /buyer/rounds          — list open rounds available to bid on
  - POST /buyer/rounds/{id}/bid — upload a bid file
  - GET  /buyer/my-results      — view won/lost results with fluffed prices
  - GET  /buyer/my-deals        — deals where this buyer won
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import require_buyer
from app.models.bid_round import BidRound
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.deal import Deal
from app.services.file_parser import parse_buyer_file
from datetime import datetime, timezone

router = APIRouter(prefix="/buyer", tags=["buyer"])


@router.get("/rounds")
def list_open_rounds(db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    rounds = db.query(BidRound).filter(BidRound.status == "open").all()
    return [{"id": r.id, "name": r.name, "commodity": r.commodity, "deadline": r.submission_deadline} for r in rounds]


@router.post("/rounds/{round_id}/bid")
async def submit_bid(round_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status != "open":
        raise HTTPException(400, "This round is not accepting bids")

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

    master_items = db.query(MasterItem).filter(MasterItem.bid_round_id == round_id).all()
    master_index = {m.part_number_normalized: m for m in master_items}

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

    db.commit()
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
