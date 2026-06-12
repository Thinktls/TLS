"""
Buyer-facing routes:
  - GET  /buyer/rounds                       — list open rounds assigned to this buyer
  - POST /buyer/rounds/{id}/bid              — upload a bid file
  - POST /buyer/rounds/{id}/bid-inline       — submit bid via inline JSON (no file upload)
  - GET  /buyer/rounds/{id}/items            — list master items for inline price editor
  - GET  /buyer/rounds/{id}/template         — download the bid template Excel
  - GET  /buyer/rounds/{id}/master-file      — download the original admin-uploaded file
  - GET  /buyer/my-results                   — view won/lost results with fluffed prices
  - GET  /buyer/my-results/{round_id}        — results for a specific round
  - GET  /buyer/my-deals                     — all won deals
  - GET  /buyer/my-rounds                    — all rounds this buyer has been invited to
  - GET  /buyer/rounds/{id}/award-sheet      — download personal award sheet
"""
import os
import mimetypes
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
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


@router.post("/rounds/{round_id}/parse-preview")
async def parse_preview(round_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """Parse a bid file without saving — returns preview rows so buyer can review before confirming."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status != "open":
        raise HTTPException(400, "This round is not accepting bids")
    assigned = db.execute(
        text("SELECT 1 FROM round_buyers WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": round_id, "bid": buyer.id},
    ).fetchone()
    if not assigned:
        raise HTTPException(403, "You are not assigned to this round")
    content = await file.read()
    try:
        rows = parse_buyer_file(content, file.filename)
    except ValueError as e:
        if settings.ANTHROPIC_API_KEY or settings.OLLAMA_BASE_URL:
            try:
                from app.services.ai_file_parser import ai_parse_buyer_file
                rows = ai_parse_buyer_file(content, file.filename)
            except ValueError as ai_e:
                raise HTTPException(400, str(ai_e))
        else:
            raise HTTPException(400, str(e))
    total_qty = sum(r["quantity"] or 0 for r in rows)
    return {
        "filename": file.filename,
        "total_lines": len(rows),
        "total_quantity": total_qty,
        "rows": rows,
    }


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

    # Resubmission: remove previous PENDING bid lines so the matcher only sees
    # the latest file. Lines already processed (matched/exception) are left alone.
    prev_files = db.query(BidFile).filter(
        BidFile.bid_round_id == round_id, BidFile.buyer_id == buyer.id
    ).all()
    for pf in prev_files:
        db.query(BidLine).filter(
            BidLine.bid_file_id == pf.id, BidLine.match_status == "pending"
        ).delete(synchronize_session="fetch")
        pf.status = "superseded"

    # Persist file to the uploads volume so admin can download it later
    import os as _os
    upload_dir = f"/app/uploads/rounds/{round_id}"
    _os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"{buyer.id}_{file.filename}".replace(" ", "_")
    disk_path = f"{upload_dir}/{safe_name}"
    with open(disk_path, "wb") as fh:
        fh.write(content)

    bid_file = BidFile(
        bid_round_id=round_id,
        buyer_id=buyer.id,
        filename=file.filename,
        file_path=disk_path,
        file_size_bytes=file_size,
        status="processing",
    )
    db.add(bid_file)
    db.flush()

    try:
        rows = parse_buyer_file(content, file.filename)
    except ValueError as e:
        if settings.ANTHROPIC_API_KEY or settings.OLLAMA_BASE_URL:
            try:
                from app.services.ai_file_parser import ai_parse_buyer_file
                rows = ai_parse_buyer_file(content, file.filename)
            except ValueError as ai_e:
                bid_file.status = "error"
                bid_file.error_message = str(ai_e)
                db.commit()
                raise HTTPException(400, str(ai_e))
        else:
            bid_file.status = "error"
            bid_file.error_message = str(e)
            db.commit()
            raise HTTPException(400, str(e))

    db.add_all([
        BidLine(bid_file_id=bid_file.id, bid_round_id=round_id, buyer_id=buyer.id, **row)
        for row in rows
    ])

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


@router.get("/rounds/{round_id}/my-submission")
def my_submission(round_id: int, db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """Return the buyer's submitted bid lines for a round so they can review what was parsed."""
    bid_file = (
        db.query(BidFile)
        .filter(BidFile.bid_round_id == round_id, BidFile.buyer_id == buyer.id)
        .order_by(BidFile.uploaded_at.desc())
        .first()
    )
    if not bid_file:
        return {"bid_file": None, "lines": []}

    lines = (
        db.query(BidLine)
        .filter(BidLine.bid_file_id == bid_file.id)
        .order_by(BidLine.row_number)
        .all()
    )

    master_ids = {l.master_item_id for l in lines if l.master_item_id}
    masters_map = {
        m.id: m for m in db.query(MasterItem).filter(MasterItem.id.in_(master_ids)).all()
    }

    return {
        "bid_file": {
            "id": bid_file.id,
            "filename": bid_file.filename,
            "uploaded_at": bid_file.uploaded_at.isoformat() if bid_file.uploaded_at else None,
            "lines_parsed": bid_file.lines_parsed,
            "status": bid_file.status,
            "error_message": bid_file.error_message,
        },
        "lines": [
            {
                "id": l.id,
                "row_number": l.row_number,
                "raw_part_number": l.raw_part_number,
                "description": l.description,
                "unit_price": l.unit_price,
                "quantity": l.quantity,
                "match_status": l.match_status,
                "match_method": l.match_method,
                "exception_type": l.exception_type,
                "matched_part_number": masters_map[l.master_item_id].part_number if l.master_item_id and l.master_item_id in masters_map else None,
                "matched_description": masters_map[l.master_item_id].description if l.master_item_id and l.master_item_id in masters_map else None,
            }
            for l in lines
        ],
    }


@router.get("/rounds/{round_id}/my-submission/download")
def download_my_submission(round_id: int, db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """Download the buyer's own submitted bid file (or reconstruct from DB if original is gone)."""
    import os, io, mimetypes, openpyxl
    bid_file = (
        db.query(BidFile)
        .filter(BidFile.bid_round_id == round_id, BidFile.buyer_id == buyer.id)
        .order_by(BidFile.uploaded_at.desc())
        .first()
    )
    if not bid_file:
        raise HTTPException(404, "No submission found for this round")

    if bid_file.file_path and os.path.exists(bid_file.file_path):
        mime, _ = mimetypes.guess_type(bid_file.filename)
        mime = mime or "application/octet-stream"
        def _iter():
            with open(bid_file.file_path, "rb") as fh:
                yield from iter(lambda: fh.read(65536), b"")
        return StreamingResponse(
            _iter(),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{bid_file.filename}"'},
        )

    # Reconstruct from parsed bid lines if original file is gone
    lines = db.query(BidLine).filter(BidLine.bid_file_id == bid_file.id).order_by(BidLine.id).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "My Bid"
    ws.append(["Part Number", "Description", "Unit Price", "Quantity"])
    for line in lines:
        ws.append([line.raw_part_number, line.description,
                   float(line.unit_price) if line.unit_price else None, line.quantity])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="my_bid_{round_id}.xlsx"'},
    )


@router.get("/my-results")
def my_results(db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    lines = (
        db.query(BidLine)
        .filter(BidLine.buyer_id == buyer.id, BidLine.match_status == "matched")
        .all()
    )

    master_ids = {l.master_item_id for l in lines if l.master_item_id}
    masters_map = {
        m.id: m for m in db.query(MasterItem).filter(MasterItem.id.in_(master_ids)).all()
    }

    results = []
    for l in lines:
        master = masters_map.get(l.master_item_id) if l.master_item_id else None
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

    try:
        data = export_buyer_award_sheet(db, round_id, buyer.id)
    except Exception as exc:
        raise HTTPException(500, detail=f"Export failed: {type(exc).__name__}: {exc}")
    filename = f"my_results_{round_id}.xlsx"
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
    try:
        data = generate_bid_template(db, round_id)
    except Exception as exc:
        raise HTTPException(500, detail=f"Template generation failed: {type(exc).__name__}: {exc}")
    filename = f"bid_template_{round_id}.xlsx"
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
    master_ids_r = {l.master_item_id for l in lines if l.master_item_id}
    masters_map_r = {
        m.id: m for m in db.query(MasterItem).filter(MasterItem.id.in_(master_ids_r)).all()
    }

    results = []
    for l in lines:
        master = masters_map_r.get(l.master_item_id) if l.master_item_id else None
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


@router.get("/rounds/{round_id}/master-file")
def download_master_file(round_id: int, db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """Download the original file admin uploaded for this round."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r or not r.master_file_uploaded:
        raise HTTPException(404, "No master file available for this round")
    assigned = db.execute(
        text("SELECT 1 FROM round_buyers WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": round_id, "bid": buyer.id},
    ).fetchone()
    if not assigned:
        raise HTTPException(403, "Not assigned to this round")

    if r.master_file_path and os.path.exists(r.master_file_path):
        fname = os.path.basename(r.master_file_path)
        mime, _ = mimetypes.guess_type(fname)
        mime = mime or "application/octet-stream"
        def _iter_file():
            with open(r.master_file_path, "rb") as fh:
                yield from iter(lambda: fh.read(65536), b"")
        return StreamingResponse(
            _iter_file(),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )

    # Fallback: serve the generated template if original file is missing
    from app.services.template_generator import generate_bid_template
    data = generate_bid_template(db, round_id)
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="bid_file_round_{round_id}.xlsx"'},
    )


@router.get("/rounds/{round_id}/items")
def get_round_items(round_id: int, db: Session = Depends(get_db), buyer=Depends(require_buyer)):
    """List master items for a round — used by inline price editor."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status != "open":
        raise HTTPException(400, "This round is not open")
    assigned = db.execute(
        text("SELECT 1 FROM round_buyers WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": round_id, "bid": buyer.id},
    ).fetchone()
    if not assigned:
        raise HTTPException(403, "Not assigned to this round")

    items = (
        db.query(MasterItem)
        .filter(MasterItem.bid_round_id == round_id)
        .order_by(MasterItem.row_number)
        .all()
    )
    return [
        {
            "id": item.id,
            "row_number": item.row_number,
            "part_number": item.part_number,
            "description": item.description,
            "manufacturer": item.manufacturer,
            "quantity": item.quantity,
            "category": item.category,
        }
        for item in items
    ]


class InlineBidLine(BaseModel):
    master_item_id: int
    part_number: str
    description: Optional[str] = ""
    unit_price: Optional[float] = None
    quantity: Optional[int] = None


@router.post("/rounds/{round_id}/bid-inline")
def submit_bid_inline(
    round_id: int,
    lines: List[InlineBidLine],
    db: Session = Depends(get_db),
    buyer=Depends(require_buyer),
):
    """Submit a bid directly from the inline form (no file upload required)."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status != "open":
        raise HTTPException(400, "This round is not accepting bids")
    if r.submission_deadline and datetime.now(timezone.utc) > r.submission_deadline:
        raise HTTPException(400, "Submission deadline has passed")
    assigned = db.execute(
        text("SELECT 1 FROM round_buyers WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": round_id, "bid": buyer.id},
    ).fetchone()
    if not assigned:
        raise HTTPException(403, "Not assigned to this round")

    priced = [l for l in lines if l.unit_price is not None and l.unit_price > 0]
    if not priced:
        raise HTTPException(400, "No priced lines — enter at least one Unit Price before submitting")

    # Supersede previous pending submissions
    prev_files = db.query(BidFile).filter(
        BidFile.bid_round_id == round_id, BidFile.buyer_id == buyer.id
    ).all()
    for pf in prev_files:
        db.query(BidLine).filter(
            BidLine.bid_file_id == pf.id, BidLine.match_status == "pending"
        ).delete(synchronize_session="fetch")
        pf.status = "superseded"

    # Create a virtual BidFile to hold these lines
    bid_file = BidFile(
        bid_round_id=round_id,
        buyer_id=buyer.id,
        filename="inline_submission.csv",
        file_path=None,
        file_size_bytes=0,
        status="processing",
    )
    db.add(bid_file)
    db.flush()

    from app.services.normalizer import normalize_part_number
    for i, line in enumerate(priced, start=1):
        db.add(BidLine(
            bid_file_id=bid_file.id,
            bid_round_id=round_id,
            buyer_id=buyer.id,
            raw_part_number=line.part_number,
            normalized_part_number=normalize_part_number(line.part_number),
            description=line.description or "",
            unit_price=line.unit_price,
            quantity=line.quantity or 1,
            total_price=round(line.unit_price * (line.quantity or 1), 4),
            row_number=i,
        ))

    bid_file.status = "processed"
    bid_file.lines_parsed = len(priced)
    bid_file.processed_at = datetime.now(timezone.utc)

    buyer.last_bid_at = datetime.now(timezone.utc)
    buyer.total_rounds_participated += 1
    db.execute(
        text("UPDATE round_buyers SET invite_status='uploaded' WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": round_id, "bid": buyer.id},
    )
    db.commit()

    create_notification(
        db,
        title=f"New bid received from {buyer.company_name or buyer.full_name}",
        body=f"{len(priced)} lines submitted for round #{round_id} (inline form)",
        category="info",
        link=f"/admin/rounds/{round_id}",
    )
    return {"message": f"Submitted {len(priced)} line items", "bid_file_id": bid_file.id}
