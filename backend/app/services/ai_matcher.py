"""
AI fuzzy matcher — Phase 2 upgrade.

Processes all bid lines with match_status='exception' and exception_type='partial_match'
or 'unmatched' in batches of 20. Calls Claude API for semantic matching.

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


def run_ai_matching(db: Session, bid_round_id: int) -> dict:
    """
    Run AI matching on all unmatched/partial_match exceptions for a round.
    Returns a summary dict with counts.
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set — AI matching skipped")
        return {"skipped": True, "reason": "No API key configured"}

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

    # Process in batches of BATCH_SIZE
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


def _batch_ai_match(
    lines: list[BidLine],
    master_items: list[MasterItem],
) -> list[tuple[Optional[MasterItem], float, str]]:
    """Send a batch of lines to Claude API for matching. Returns one result per line."""
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        # Build master item index for lookup
        master_by_index: dict[int, MasterItem] = {i + 1: m for i, m in enumerate(master_items[:100])}
        master_list_text = "\n".join(
            f"{i}. {m.part_number} | {m.description or ''} | {m.manufacturer or ''}"
            for i, m in master_by_index.items()
        )

        lines_text = "\n".join(
            f"Line {j + 1}: raw_pn={line.raw_part_number!r} desc={line.description or ''!r}"
            for j, line in enumerate(lines)
        )

        prompt = f"""You are matching IT hardware part numbers for a procurement platform.

MASTER CATALOG (up to 100 items):
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

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",  # fast + cheap for batch matching
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text.strip()
        # Strip markdown code fences if present
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

        # Pad if Claude returned fewer results than lines
        while len(output) < len(lines):
            output.append((None, 0.0, "No result returned"))

        return output

    except Exception as e:
        logger.error(f"AI batch matching failed: {e}")
        return [(None, 0.0, f"Error: {str(e)}")] * len(lines)
