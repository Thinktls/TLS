"""
Three-tier part number matching:
  1. Exact match on normalized_part_number
  2. rapidfuzz token_sort_ratio  >= 88 => auto-match, 65-87 => flag for review
  3. AI semantic match via configured AI backend (called only for flagged items)
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

    # Build duplicate detection index: (buyer_id, normalized_pn) → first line seen
    seen: dict[tuple, BidLine] = {}

    for line in bid_lines:
        pn = line.normalized_part_number or ""

        # Duplicate detection: same buyer submitting same normalized PN twice in this batch
        dedup_key = (line.buyer_id, pn)
        if dedup_key in seen:
            line.match_status = "exception"
            line.exception_type = "duplicate"
            line.exception_notes = f"Duplicate part number '{pn}' submitted by same buyer — keeping earlier line"
            continue
        seen[dedup_key] = line

        # Tier 1: exact
        if pn in master_index:
            master = master_index[pn]
            _assign_match(line, master, "exact", 100.0)
            # Overbid detection: bid quantity exceeds master quantity
            if line.quantity and master.quantity and line.quantity > master.quantity:
                line.match_status = "exception"
                line.exception_type = "overbid"
                line.exception_notes = (
                    f"Bid qty {line.quantity} exceeds master qty {master.quantity}"
                )
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
            if line.quantity and best_master and best_master.quantity and line.quantity > best_master.quantity:
                line.match_status = "exception"
                line.exception_type = "overbid"
                line.exception_notes = (
                    f"Bid qty {line.quantity} exceeds master qty {best_master.quantity}"
                )
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
    """Semantically match a single part number using the configured AI backend (Anthropic or Ollama)."""
    from app.services.ai_matcher import _build_prompt, _parse_response, _batch_ai_match
    from app.models.bid_line import BidLine

    # Wrap the single input as a fake BidLine so batch helpers can be reused
    dummy = BidLine()
    dummy.raw_part_number = raw_part
    dummy.description = description

    results = _batch_ai_match([dummy], master_items)
    master, confidence, reason = results[0]
    return master, confidence, reason
