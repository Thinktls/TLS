"""
Three-tier part number matching:
  1. Exact match on normalized_part_number
  2. rapidfuzz token_sort_ratio  >= 88 => auto-match, 65-87 => flag for review
  3. AI semantic match via Claude API (called only for flagged items)
"""
from rapidfuzz import fuzz
from sqlalchemy.orm import Session
from app.models.master_item import MasterItem
from app.models.bid_line import BidLine

EXACT_THRESHOLD = 100
AUTO_MATCH_THRESHOLD = 88
REVIEW_THRESHOLD = 65


def match_bid_lines(bid_lines: list[BidLine], master_items: list[MasterItem]) -> list[BidLine]:
    master_index = {m.part_number_normalized: m for m in master_items}
    master_list = list(master_items)

    for line in bid_lines:
        pn = line.normalized_part_number or ""

        # Tier 1: exact
        if pn in master_index:
            _assign_match(line, master_index[pn], "exact", 100.0)
            continue

        # Tier 2: fuzzy
        best_score = 0.0
        best_master = None
        for m in master_list:
            score = fuzz.token_sort_ratio(pn, m.part_number_normalized)
            if score > best_score:
                best_score = score
                best_master = m

        if best_score >= AUTO_MATCH_THRESHOLD:
            _assign_match(line, best_master, "fuzzy", best_score)
        elif best_score >= REVIEW_THRESHOLD:
            line.master_item_id = best_master.id if best_master else None
            line.match_method = "fuzzy"
            line.match_score = best_score
            line.match_status = "exception"
            line.exception_type = "partial_match"
            line.exception_notes = f"Fuzzy score {best_score:.1f}% — needs manual review"
        else:
            line.match_status = "exception"
            line.exception_type = "unmatched"
            line.exception_notes = f"Best fuzzy score was {best_score:.1f}% — below threshold"

    return bid_lines


def _assign_match(line: BidLine, master: MasterItem, method: str, score: float):
    line.master_item_id = master.id
    line.match_method = method
    line.match_score = score
    line.match_status = "matched"


async def ai_match_line(raw_part: str, description: str, master_items: list[MasterItem]) -> tuple[MasterItem | None, float, str]:
    """Use Claude API to semantically match a part number. Returns (master_item, confidence, reasoning)."""
    try:
        import anthropic
        from app.core.config import settings

        if not settings.ANTHROPIC_API_KEY:
            return None, 0.0, "No API key configured"

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        candidates = master_items[:20]  # limit context size
        candidate_text = "\n".join([
            f"{i+1}. Part: {m.part_number} | Desc: {m.description} | Mfr: {m.manufacturer}"
            for i, m in enumerate(candidates)
        ])

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": f"""You are matching IT hardware part numbers. A buyer submitted this part:
Part Number: {raw_part}
Description: {description}

From the ThinkTLS master list, find the best match:
{candidate_text}

Reply with JSON only: {{"match_index": <1-based index or null>, "confidence": <0-100>, "reason": "<one sentence>"}}"""
            }]
        )

        import json
        result = json.loads(message.content[0].text.strip())
        idx = result.get("match_index")
        confidence = float(result.get("confidence", 0))
        reason = result.get("reason", "")

        if idx and 1 <= idx <= len(candidates):
            return candidates[idx - 1], confidence, reason
        return None, confidence, reason

    except Exception as e:
        return None, 0.0, f"AI match error: {str(e)}"
