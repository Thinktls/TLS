"""
Razor ERP integration client.

Implements a push queue with exponential back-off retry (3 attempts).
The actual API endpoint and auth are configured via environment variables:
  RAZOR_API_URL  — base URL of the Razor ERP API
  RAZOR_API_KEY  — Bearer token

When RAZOR_API_URL is unset (dev / staging), calls are stubbed and a
RazorPushError is raised so the caller can log a notification and fall
back to CSV export.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models.deal import Deal
from app.api.routes.notifications import create_notification
from app.core.config import settings

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
BACKOFF_BASE = 2.0  # seconds


class RazorPushError(Exception):
    pass


def _build_payload(deal: Deal) -> dict:
    return {
        "externalId": f"TLS-{deal.id}",
        "partNumber": deal.part_number,
        "description": deal.description,
        "quantity": deal.quantity,
        "unitPrice": deal.winning_price,
        "totalValue": deal.total_value,
        "supplierId": deal.winning_buyer_id,
        "bidRoundId": deal.bid_round_id,
        "approvedAt": deal.approved_at.isoformat() if deal.approved_at else None,
        "approvedBy": deal.approved_by,
    }


async def _do_post(payload: dict) -> str:
    """POST to Razor and return the Razor deal ID on success."""
    if not settings.RAZOR_API_URL:
        raise RazorPushError("RAZOR_API_URL not configured — integration pending")

    headers = {"Authorization": f"Bearer {settings.RAZOR_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{settings.RAZOR_API_URL}/deals", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        razor_id = data.get("id") or data.get("dealId") or str(resp.status_code)
        return razor_id


async def push_deal_to_razor(db: Session, deal: Deal) -> str:
    """
    Push a single approved deal to Razor ERP with retry.
    Updates deal.razor_push_status in place; caller must commit.
    Returns razor_deal_id on success, raises RazorPushError on final failure.
    """
    payload = _build_payload(deal)
    last_exc: Optional[Exception] = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            razor_id = await _do_post(payload)
            deal.razor_deal_id = razor_id
            deal.razor_push_status = "success"
            deal.razor_pushed_at = datetime.now(timezone.utc)
            deal.status = "pushed_to_razor"
            log.info("Razor push succeeded for deal %d on attempt %d", deal.id, attempt)
            return razor_id
        except Exception as exc:
            last_exc = exc
            log.warning("Razor push attempt %d/%d failed for deal %d: %s", attempt, MAX_ATTEMPTS, deal.id, exc)
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(BACKOFF_BASE ** attempt)

    deal.razor_push_status = "failed"
    create_notification(
        db,
        title=f"Razor push failed for deal #{deal.id}",
        body=str(last_exc),
        category="error",
        link=f"/admin/rounds/{deal.bid_round_id}/deals",
    )
    raise RazorPushError(str(last_exc))


async def push_round_to_razor(db: Session, round_id: int) -> dict:
    """Push all approved deals in a round. Returns a summary dict."""
    deals = db.query(Deal).filter(
        Deal.bid_round_id == round_id,
        Deal.status == "approved",
    ).all()

    pushed, failed = 0, 0
    for deal in deals:
        try:
            await push_deal_to_razor(db, deal)
            pushed += 1
        except RazorPushError:
            failed += 1

    db.commit()
    if failed == 0:
        create_notification(
            db,
            title=f"Round #{round_id} pushed to Razor ERP",
            body=f"{pushed} deals pushed successfully",
            category="success",
            link=f"/admin/rounds/{round_id}/deals",
        )
    else:
        create_notification(
            db,
            title=f"Razor push partially failed for round #{round_id}",
            body=f"{pushed} succeeded, {failed} failed",
            category="warning",
            link=f"/admin/rounds/{round_id}/deals",
        )

    return {"pushed": pushed, "failed": failed, "total": len(deals)}
