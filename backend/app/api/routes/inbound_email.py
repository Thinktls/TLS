"""
SendGrid Inbound Parse webhook.
Receives emails sent to bids@thinktls.com, extracts attachments,
and auto-processes them as bid file submissions.

SendGrid Inbound Parse posts multipart/form-data to this endpoint.
Configure webhook URL in SendGrid: https://yourhost/api/inbound-email
"""
import hmac
import hashlib
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.core.config import settings


def _verify_sendgrid_signature(request_body: bytes, signature: str, timestamp: str) -> bool:
    """Verify SendGrid's signed webhook to prevent spoofed requests."""
    if not settings.SENDGRID_WEBHOOK_KEY:
        return True  # Signature validation disabled (dev/test mode)
    token = timestamp + request_body.decode("utf-8", errors="replace")
    expected = hmac.new(settings.SENDGRID_WEBHOOK_KEY.encode(), token.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
from app.models.bid_round import BidRound
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.user import User
from app.services.file_parser import parse_buyer_file
from app.services.email_service import _send

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/inbound-email", tags=["inbound_email"])

# Detect round ID from subject or envelope — e.g. "Bid Submission Round 7" or [RID:7]
ROUND_ID_PATTERNS = [
    re.compile(r"\[RID:(\d+)\]", re.IGNORECASE),
    re.compile(r"round\s+#?(\d+)", re.IGNORECASE),
    re.compile(r"bid.*round.*?(\d+)", re.IGNORECASE),
]


@router.post("")
async def receive_inbound_email(request: Request):
    """
    SendGrid Inbound Parse webhook handler.
    Accepts multipart/form-data with email fields + attachments.
    """
    # Verify SendGrid signature if key is configured
    if settings.SENDGRID_WEBHOOK_KEY:
        raw_body = await request.body()
        sig = request.headers.get("X-Twilio-Email-Event-Webhook-Signature", "")
        ts  = request.headers.get("X-Twilio-Email-Event-Webhook-Timestamp", "")
        if not sig or not _verify_sendgrid_signature(raw_body, sig, ts):
            logger.warning("SendGrid webhook signature verification failed")
            raise HTTPException(403, "Invalid webhook signature")

    try:
        form = await request.form()
    except Exception as e:
        logger.error(f"Failed to parse inbound email form: {e}")
        raise HTTPException(400, "Invalid form data")

    from_email = str(form.get("from", "")).lower()
    subject = str(form.get("subject", ""))
    to_email = str(form.get("to", ""))
    num_attachments = int(form.get("attachments", 0))

    logger.info(f"Inbound email from={from_email} subject={subject!r} attachments={num_attachments}")

    db: Session = SessionLocal()
    try:
        # Find buyer by sender email
        buyer = _find_buyer_by_email(db, from_email)
        if not buyer:
            logger.warning(f"Inbound email from unknown sender: {from_email}")
            _send(
                from_email, from_email,
                "ThinkTLS: Could not process your bid submission",
                f"<p>We could not find a buyer account associated with <strong>{from_email}</strong>. "
                "Please contact your ThinkTLS administrator.</p>",
            )
            return {"status": "rejected", "reason": "unknown_sender"}

        if not buyer.is_active:
            logger.warning(f"Inbound email from disabled buyer: {from_email}")
            return {"status": "rejected", "reason": "buyer_disabled"}

        # Detect round ID from subject
        round_id = _extract_round_id(subject)
        if not round_id:
            logger.warning(f"Could not extract round ID from subject: {subject!r}")
            _send(
                buyer.email, buyer.full_name,
                "ThinkTLS: Could not process your bid — round not identified",
                f"<p>Hello {buyer.full_name},</p>"
                "<p>We received your email but could not identify which bid round you're submitting for. "
                "Please include the round number in your subject line, e.g. <strong>[RID:5]</strong> or "
                "<strong>Bid Round 5</strong>.</p>",
            )
            return {"status": "rejected", "reason": "round_id_not_found"}

        # Validate round exists and is open
        bid_round = db.query(BidRound).filter(BidRound.id == round_id).first()
        if not bid_round:
            return {"status": "rejected", "reason": f"round_{round_id}_not_found"}
        if bid_round.status != "open":
            _send(
                buyer.email, buyer.full_name,
                f"ThinkTLS: Round {bid_round.name} is not accepting bids",
                f"<p>Hello {buyer.full_name},</p>"
                f"<p>Round <strong>{bid_round.name}</strong> is currently <strong>{bid_round.status}</strong> "
                "and is not accepting new submissions.</p>",
            )
            return {"status": "rejected", "reason": "round_not_open"}

        # Check deadline
        if bid_round.submission_deadline and datetime.now(timezone.utc) > bid_round.submission_deadline:
            _send(
                buyer.email, buyer.full_name,
                f"ThinkTLS: Submission deadline passed for {bid_round.name}",
                f"<p>The submission deadline for <strong>{bid_round.name}</strong> has passed. "
                "Please contact your ThinkTLS administrator if you believe this is an error.</p>",
            )
            return {"status": "rejected", "reason": "deadline_passed"}

        if num_attachments == 0:
            _send(
                buyer.email, buyer.full_name,
                "ThinkTLS: No attachment found in your bid email",
                "<p>We received your email but no attachment was found. "
                "Please reply with your pricing Excel/CSV file attached.</p>",
            )
            return {"status": "rejected", "reason": "no_attachments"}

        # Process each attachment
        processed = 0
        errors = []
        for i in range(1, num_attachments + 1):
            attachment = form.get(f"attachment{i}")
            if attachment is None:
                continue
            filename = getattr(attachment, "filename", f"attachment_{i}.xlsx")
            if not _is_valid_extension(filename):
                continue

            content = await attachment.read()
            result = _process_attachment(db, content, filename, buyer, bid_round)
            if result.get("ok"):
                processed += 1
            else:
                errors.append(result.get("error", "Unknown error"))

        if processed > 0:
            _send(
                buyer.email, buyer.full_name,
                f"ThinkTLS: Bid received for {bid_round.name}",
                f"<p>Hello {buyer.full_name},</p>"
                f"<p>Your bid for <strong>{bid_round.name}</strong> has been received and is being processed.</p>"
                "<p>You will receive results once the round closes.</p>",
            )
            return {"status": "accepted", "files_processed": processed}
        else:
            _send(
                buyer.email, buyer.full_name,
                f"ThinkTLS: Error processing your bid for {bid_round.name}",
                f"<p>Hello {buyer.full_name},</p>"
                f"<p>We could not process your bid file. Errors: {'; '.join(errors)}</p>"
                "<p>Please ensure your file is in Excel (.xlsx) or CSV format and matches the template.</p>",
            )
            return {"status": "error", "errors": errors}

    finally:
        db.close()


def _find_buyer_by_email(db: Session, raw_from: str) -> User | None:
    # "John Smith <john@company.com>" → extract the email part
    match = re.search(r"[\w.\-+]+@[\w.\-]+", raw_from)
    email = match.group(0) if match else raw_from.strip()
    return db.query(User).filter(User.email == email.lower(), User.role == "buyer").first()


def _extract_round_id(subject: str) -> int | None:
    for pattern in ROUND_ID_PATTERNS:
        m = pattern.search(subject)
        if m:
            return int(m.group(1))
    return None


def _is_valid_extension(filename: str) -> bool:
    return filename.lower().endswith((".xlsx", ".xls", ".csv", ".pdf", ".docx", ".doc"))


def _process_attachment(db: Session, content: bytes, filename: str, buyer: User, bid_round: BidRound) -> dict:
    try:
        rows = parse_buyer_file(content, filename)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    import os as _os
    upload_dir = f"/app/uploads/rounds/{bid_round.id}"
    _os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"{buyer.id}_{filename}".replace(" ", "_")
    disk_path = f"{upload_dir}/{safe_name}"
    with open(disk_path, "wb") as fh:
        fh.write(content)

    bid_file = BidFile(
        bid_round_id=bid_round.id,
        buyer_id=buyer.id,
        filename=filename,
        file_path=disk_path,
        file_size_bytes=len(content),
        status="processing",
    )
    db.add(bid_file)
    db.flush()

    for row in rows:
        db.add(BidLine(
            bid_file_id=bid_file.id,
            bid_round_id=bid_round.id,
            buyer_id=buyer.id,
            **row,
        ))

    bid_file.status = "processed"
    bid_file.lines_parsed = len(rows)
    bid_file.processed_at = datetime.now(timezone.utc)

    buyer.last_bid_at = datetime.now(timezone.utc)
    buyer.total_rounds_participated = (buyer.total_rounds_participated or 0) + 1

    # Update round_buyers invite_status to 'uploaded'
    from sqlalchemy import text
    db.execute(
        text("UPDATE round_buyers SET invite_status='uploaded' WHERE round_id=:rid AND buyer_id=:bid"),
        {"rid": bid_round.id, "bid": buyer.id},
    )

    db.commit()
    logger.info(f"Email ingestion: {len(rows)} lines from {buyer.email} for round {bid_round.id}")
    return {"ok": True, "lines": len(rows)}
