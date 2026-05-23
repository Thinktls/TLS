"""
AI fuzzy matcher — Phase 2 upgrade.

Processes all bid lines with match_status='exception' and exception_type='partial_match'
or 'unmatched' in batches. Calls an LLM for semantic matching.

Supports two backends (in priority order):
  1. Anthropic Claude (set ANTHROPIC_API_KEY)
  2. Ollama / any OpenAI-compatible endpoint (set OLLAMA_BASE_URL + OLLAMA_MODEL)

Auto-accepts if confidence >= 85.
Stores ai_match_suggestion + ai_match_confidence on every processed line regardless.
"""
import json
import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.core.config import settings

logger = logging.getLogger(__name__)

AUTO_ACCEPT_THRESHOLD = 85.0
BATCH_SIZE = 20


def _ai_available() -> bool:
    return bool(settings.ANTHROPIC_API_KEY or settings.OLLAMA_BASE_URL)


def run_ai_matching(db: Session, bid_round_id: int) -> dict:
    """
    Run AI matching on all unmatched/partial_match exceptions for a round.
    Returns a summary dict with counts.
    """
    if not _ai_available():
        logger.warning("No AI backend configured — AI matching skipped. Set ANTHROPIC_API_KEY or OLLAMA_BASE_URL.")
        return {"skipped": True, "reason": "No AI backend configured (set ANTHROPIC_API_KEY or OLLAMA_BASE_URL)"}

    lines_to_match = (
        db.query(BidLine)
        .filter(
            BidLine.bid_round_id == bid_round_id,
            BidLine.match_status == "exception",
            BidLine.exception_type.in_(["unmatched", "partial_match"]),
        )
        .all()
    )

    master_items = (
        db.query(MasterItem)
        .filter(MasterItem.bid_round_id == bid_round_id)
        .all()
    )

    if not lines_to_match or not master_items:
        return {"processed": 0, "auto_accepted": 0, "still_flagged": 0}

    auto_accepted = 0
    still_flagged = 0
    errors = 0

    for i in range(0, len(lines_to_match), BATCH_SIZE):
        batch = lines_to_match[i : i + BATCH_SIZE]
        results = _batch_ai_match(batch, master_items)

        for line, (matched_master, confidence, reason) in zip(batch, results):
            line.ai_match_suggestion = matched_master.part_number_normalized if matched_master else None
            line.ai_match_confidence = confidence

            if reason.startswith("Error:"):
                errors += 1
                still_flagged += 1
                line.exception_notes = f"AI matching error — {reason}"
            elif matched_master and confidence >= AUTO_ACCEPT_THRESHOLD:
                line.master_item_id = matched_master.id
                line.match_method = "ai"
                line.match_score = confidence
                line.match_status = "matched"
                line.exception_type = None
                line.exception_notes = f"AI matched with {confidence:.0f}% confidence: {reason}"
                auto_accepted += 1
            else:
                line.exception_notes = (
                    f"AI suggestion: {matched_master.part_number_normalized if matched_master else 'none'} "
                    f"({confidence:.0f}% confidence) — {reason}. Below auto-accept threshold."
                )
                still_flagged += 1

    db.commit()

    return {
        "processed": len(lines_to_match),
        "auto_accepted": auto_accepted,
        "still_flagged": still_flagged,
        "errors": errors,
    }


_CATALOG_WINDOW = 60  # master items to send per prompt


def _top_candidates(lines: list[BidLine], master_items: list[MasterItem]) -> list[MasterItem]:
    """
    Return the top _CATALOG_WINDOW master items most relevant to this batch of lines,
    using rapidfuzz token_sort_ratio against normalized part numbers and descriptions.
    Falls back to a simple slice when rapidfuzz is unavailable.
    """
    if not master_items:
        return []
    try:
        from rapidfuzz import fuzz
        # Build a search string from all lines in the batch
        query_tokens = " ".join(
            f"{l.raw_part_number} {l.description or ''}" for l in lines
        ).lower()

        scored = [
            (m, max(
                fuzz.token_sort_ratio(query_tokens, (m.part_number_normalized or "").lower()),
                fuzz.token_sort_ratio(query_tokens, (m.description or "").lower()),
            ))
            for m in master_items
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [m for m, _ in scored[:_CATALOG_WINDOW]]
    except ImportError:
        return master_items[:_CATALOG_WINDOW]


def _build_prompt(lines: list[BidLine], master_items: list[MasterItem]) -> tuple[str, dict]:
    """Build the matching prompt and master index. Returns (prompt, master_by_index)."""
    candidates = _top_candidates(lines, master_items)
    master_by_index: dict[int, MasterItem] = {i + 1: m for i, m in enumerate(candidates)}
    master_list_text = "\n".join(
        f"{i}. {m.part_number} | {m.description or ''} | {m.manufacturer or ''}"
        for i, m in master_by_index.items()
    )
    lines_text = "\n".join(
        f"Line {j + 1}: raw_pn={line.raw_part_number!r} desc={line.description or ''!r}"
        for j, line in enumerate(lines)
    )
    prompt = f"""You are matching IT hardware part numbers for a procurement platform.

MASTER CATALOG ({len(candidates)} best-matched items pre-selected):
{master_list_text}

BUYER SUBMITTED LINES (need matching):
{lines_text}

For each buyer line, find the best matching master catalog item.
Respond with a JSON array — one object per buyer line, in the same order:
[
  {{"line": 1, "master_index": <1-based integer or null>, "confidence": <0-100 integer>, "reason": "<10 words max>"}},
  ...
]
Return ONLY the JSON array. No explanation."""
    return prompt, master_by_index


def _parse_response(raw: str, lines: list[BidLine], master_by_index: dict) -> list[tuple[Optional[MasterItem], float, str]]:
    """Parse LLM JSON response into (master, confidence, reason) tuples."""
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
        raw = raw.rsplit("```", 1)[0].strip()

    results_json: list[dict] = json.loads(raw)
    output: list[tuple[Optional[MasterItem], float, str]] = []
    for entry in results_json:
        idx = entry.get("master_index")
        confidence = float(entry.get("confidence", 0))
        reason = entry.get("reason", "")
        master = master_by_index.get(idx) if idx else None
        output.append((master, confidence, reason))

    while len(output) < len(lines):
        output.append((None, 0.0, "No result returned"))

    return output


def _batch_ai_match(
    lines: list[BidLine],
    master_items: list[MasterItem],
) -> list[tuple[Optional[MasterItem], float, str]]:
    """Route to the appropriate AI backend."""
    if settings.ANTHROPIC_API_KEY:
        return _batch_anthropic(lines, master_items)
    if settings.OLLAMA_BASE_URL:
        return _batch_ollama(lines, master_items)
    return [(None, 0.0, "Error: No AI backend configured")] * len(lines)


def _batch_anthropic(
    lines: list[BidLine],
    master_items: list[MasterItem],
) -> list[tuple[Optional[MasterItem], float, str]]:
    """Match using Anthropic Claude API."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        prompt, master_by_index = _build_prompt(lines, master_items)

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_response(message.content[0].text.strip(), lines, master_by_index)
    except Exception as e:
        logger.error(f"Anthropic batch matching failed: {e}")
        return [(None, 0.0, f"Error: {str(e)}")] * len(lines)


def _batch_ollama(
    lines: list[BidLine],
    master_items: list[MasterItem],
) -> list[tuple[Optional[MasterItem], float, str]]:
    """Match using Ollama (or any OpenAI-compatible endpoint)."""
    try:
        import httpx

        prompt, master_by_index = _build_prompt(lines, master_items)
        base = settings.OLLAMA_BASE_URL.rstrip("/")

        # Try OpenAI-compatible /v1/chat/completions endpoint (Ollama supports this)
        payload = {
            "model": settings.OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "format": "json",  # Ollama JSON mode — forces valid JSON output
        }

        headers = {}
        if settings.OLLAMA_API_KEY:
            headers["Authorization"] = f"Bearer {settings.OLLAMA_API_KEY}"

        resp = httpx.post(
            f"{base}/v1/chat/completions",
            json=payload,
            headers=headers,
            timeout=120.0,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        return _parse_response(raw, lines, master_by_index)

    except Exception as e:
        logger.error(f"Ollama batch matching failed: {e}")
        return [(None, 0.0, f"Error: {str(e)}")] * len(lines)
