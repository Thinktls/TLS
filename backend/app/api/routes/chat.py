"""
AI Chatbot endpoint — context-aware assistant for admin and buyers.

Works with any AI backend:
  1. Anthropic Claude (ANTHROPIC_API_KEY)
  2. Self-hosted / OpenRouter / Groq (OLLAMA_BASE_URL + OLLAMA_MODEL)

No external API keys required if OLLAMA_BASE_URL is set — point it at a local
Llama / Mistral instance for a fully self-hosted, zero-cost chatbot.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.core.security import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

_PLATFORM_CONTEXT = """
You are the ThinkTLS Bid Desk AI assistant. ThinkTLS is a B2B IT hardware reverse-auction platform.

Platform overview:
- Admin creates "Bid Rounds" for IT hardware (laptops, desktops, servers, drives, memory, networking).
- Buyers receive email invitations, download an inventory file, fill in their offer prices, and upload the bid file.
- The system auto-matches buyer bids to master inventory items, selects winners (lowest price), and generates deal records.
- Approved deals can be pushed to the Razor ERP system.
- "Fluff" is a price-obfuscation feature: losing buyers see a slightly inflated price instead of the real winning price, protecting pricing intelligence.

Key terms:
- Bid Round: one procurement event for a commodity.
- Master Item: one inventory line in a round (part number, qty, description).
- Bid Line: a buyer's offer for one master item.
- Deal: a awarded match — the winning bid line becomes a deal pending admin approval.
- Fluff %: the % added to the real winning price shown to losers.
- ERP Report: one-row-per-unit export for broker ERP upload.

Be concise and helpful. If you don't know something, say so honestly.
Never make up data — use only the context provided below.
"""


class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    round_id: Optional[int] = None


def _ai_available() -> bool:
    return bool(settings.ANTHROPIC_API_KEY or settings.OLLAMA_BASE_URL)


async def _call_anthropic(system: str, messages: list[dict]) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    resp = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=system,
        messages=messages,
    )
    return resp.content[0].text.strip()


async def _call_ollama(system: str, messages: list[dict]) -> str:
    import httpx
    base = settings.OLLAMA_BASE_URL.rstrip("/")
    endpoint = f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if settings.OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {settings.OLLAMA_API_KEY}"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "temperature": 0.3,
        "max_tokens": 600,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(endpoint, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


async def _call_ai(system: str, messages: list[dict]) -> str:
    if settings.ANTHROPIC_API_KEY:
        return await _call_anthropic(system, messages)
    return await _call_ollama(system, messages)


# ── Context builders ──────────────────────────────────────────────────────────

def _admin_context(db: Session, round_id: Optional[int]) -> str:
    """Pull live platform stats for the admin chatbot context."""
    try:
        stats = db.execute(text("""
            SELECT
                (SELECT COUNT(*) FROM bid_rounds) AS total_rounds,
                (SELECT COUNT(*) FROM bid_rounds WHERE status = 'open') AS open_rounds,
                (SELECT COUNT(*) FROM bid_rounds WHERE status = 'complete') AS complete_rounds,
                (SELECT COUNT(*) FROM users WHERE role = 'buyer' AND is_active = true) AS active_buyers,
                (SELECT COUNT(*) FROM deals WHERE status = 'approved') AS approved_deals,
                (SELECT COALESCE(SUM(total_value), 0) FROM deals WHERE status = 'approved') AS total_deal_value,
                (SELECT COUNT(*) FROM deals WHERE status = 'pending_approval') AS pending_deals
        """)).fetchone()

        recent_rounds = db.execute(text("""
            SELECT name, status, commodity, total_line_items,
                   TO_CHAR(created_at, 'MM/DD/YYYY') AS created
            FROM bid_rounds ORDER BY created_at DESC LIMIT 5
        """)).fetchall()

        context = f"""
Current platform stats:
- Total rounds: {stats.total_rounds} ({stats.open_rounds} open, {stats.complete_rounds} complete)
- Active buyers: {stats.active_buyers}
- Approved deals: {stats.approved_deals} (${stats.total_deal_value:,.0f} total value)
- Deals pending approval: {stats.pending_deals}

Recent rounds: {', '.join(f"{r.name} [{r.status}]" for r in recent_rounds)}
"""

        if round_id:
            r_stats = db.execute(text("""
                SELECT br.name, br.status, br.commodity, br.total_line_items,
                       COUNT(DISTINCT bf.buyer_id) AS buyer_count,
                       COUNT(DISTINCT bl.id) FILTER (WHERE bl.match_status = 'matched') AS matched_lines,
                       COUNT(DISTINCT d.id) AS deal_count,
                       COALESCE(SUM(d.total_value) FILTER (WHERE d.status = 'approved'), 0) AS deal_value
                FROM bid_rounds br
                LEFT JOIN bid_files bf ON bf.bid_round_id = br.id
                LEFT JOIN bid_lines bl ON bl.bid_round_id = br.id
                LEFT JOIN deals d ON d.bid_round_id = br.id
                WHERE br.id = :rid
                GROUP BY br.id
            """), {"rid": round_id}).fetchone()
            if r_stats:
                context += f"""
Current round context (Round #{round_id} — {r_stats.name}):
- Status: {r_stats.status} | Commodity: {r_stats.commodity}
- Master items: {r_stats.total_line_items} | Buyers participated: {r_stats.buyer_count}
- Matched bid lines: {r_stats.matched_lines} | Deals: {r_stats.deal_count} (${r_stats.deal_value:,.0f})
"""
        return context
    except Exception as e:
        logger.warning("Admin context error: %s", e)
        return "Live stats temporarily unavailable."


def _buyer_context(db: Session, buyer_id: int, round_id: Optional[int]) -> str:
    """Pull live data for the buyer chatbot context."""
    try:
        buyer = db.execute(text("""
            SELECT full_name, company_name, buyer_score, win_rate,
                   total_lines_bid, total_lines_won
            FROM users WHERE id = :uid
        """), {"uid": buyer_id}).fetchone()

        open_rounds = db.execute(text("""
            SELECT br.name, br.commodity,
                   TO_CHAR(br.submission_deadline AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York',
                           'MM/DD/YYYY HH12:MI AM') || ' EST' AS deadline
            FROM bid_rounds br
            JOIN round_buyers rb ON rb.round_id = br.id
            WHERE rb.buyer_id = :uid AND br.status = 'open'
            ORDER BY br.submission_deadline
            LIMIT 5
        """), {"uid": buyer_id}).fetchall()

        recent_wins = db.execute(text("""
            SELECT br.name, d.part_number, d.winning_price, d.quantity,
                   TO_CHAR(d.approved_at, 'MM/DD/YYYY') AS approved
            FROM deals d
            JOIN bid_rounds br ON br.id = d.bid_round_id
            WHERE d.winning_buyer_id = :uid AND d.status = 'approved'
            ORDER BY d.approved_at DESC LIMIT 5
        """), {"uid": buyer_id}).fetchall()

        context = f"""
Your account ({buyer.company_name or buyer.full_name}):
- Buyer score: {buyer.buyer_score or 0:.1f}
- Win rate: {(buyer.win_rate or 0)*100:.1f}%
- Total lines bid: {buyer.total_lines_bid or 0} | Won: {buyer.total_lines_won or 0}

Open rounds you're invited to:
{chr(10).join(f"  - {r.name} ({r.commodity}) — deadline {r.deadline}" for r in open_rounds) or "  None currently open."}

Recent wins:
{chr(10).join(f"  - {w.part_number} × {w.quantity} @ ${w.winning_price:.2f} ({w.name}, {w.approved})" for w in recent_wins) or "  No recent wins."}
"""

        if round_id:
            r_info = db.execute(text("""
                SELECT br.name, br.status, br.commodity,
                       COUNT(bl.id) FILTER (WHERE bl.match_status='matched') AS my_bids,
                       COUNT(bl.id) FILTER (WHERE bl.is_winner = true) AS my_wins,
                       COALESCE(SUM(bl.unit_price * bl.quantity) FILTER (WHERE bl.match_status='matched'), 0) AS my_bid_value
                FROM bid_rounds br
                LEFT JOIN bid_lines bl ON bl.bid_round_id = br.id AND bl.buyer_id = :uid
                WHERE br.id = :rid
                GROUP BY br.id
            """), {"uid": buyer_id, "rid": round_id}).fetchone()
            if r_info:
                context += f"""
Current round (Round #{round_id} — {r_info.name}):
- Status: {r_info.status} | Commodity: {r_info.commodity}
- Your bids: {r_info.my_bids} lines (${r_info.my_bid_value:,.0f} total bid value)
- Your wins so far: {r_info.my_wins} lines
"""
        return context
    except Exception as e:
        logger.warning("Buyer context error: %s", e)
        return "Live data temporarily unavailable."


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/admin")
async def admin_chat(req: ChatRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    if not _ai_available():
        raise HTTPException(503, "AI not configured. Set ANTHROPIC_API_KEY or OLLAMA_BASE_URL.")

    live_context = _admin_context(db, req.round_id)
    system = _PLATFORM_CONTEXT + "\nYou are speaking with the ThinkTLS ADMIN.\n\n" + live_context

    messages = [{"role": m.role, "content": m.content} for m in req.history[-10:]]
    messages.append({"role": "user", "content": req.message})

    try:
        reply = await _call_ai(system, messages)
    except Exception as e:
        logger.error("Chat AI error: %s", e)
        raise HTTPException(500, "AI response failed. Please try again.")

    return {"reply": reply}


@router.post("/buyer")
async def buyer_chat(req: ChatRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("buyer", "admin"):
        raise HTTPException(403, "Buyers only")
    if not _ai_available():
        raise HTTPException(503, "AI not configured.")

    live_context = _buyer_context(db, user.id, req.round_id)
    system = (
        _PLATFORM_CONTEXT
        + f"\nYou are speaking with BUYER: {user.full_name} ({user.company_name or ''}).\n"
        + "Only show this buyer their own data. Never reveal other buyers' prices or identities.\n\n"
        + live_context
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history[-10:]]
    messages.append({"role": "user", "content": req.message})

    try:
        reply = await _call_ai(system, messages)
    except Exception as e:
        logger.error("Chat AI error: %s", e)
        raise HTTPException(500, "AI response failed. Please try again.")

    return {"reply": reply}
