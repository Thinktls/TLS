"""
Three-tier part number matching:
  1. Exact match on normalized_part_number
  2. rapidfuzz token_sort_ratio  >= 88 => auto-match, 65-87 => flag for review
  3. AI semantic match via configured AI backend (called only for flagged items)
"""
from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session
from app.models.master_item import MasterItem
from app.models.bid_line import BidLine

EXACT_THRESHOLD = 100
AUTO_MATCH_THRESHOLD = 88
REVIEW_THRESHOLD = 65


def match_bid_lines(bid_lines: list[BidLine], master_items: list[MasterItem]) -> list[BidLine]:
    master_index = {m.part_number_normalized: m for m in master_items}
    master_list = list(master_items)
    # Pre-built choices for the fuzzy tier. rapidfuzz's process.extractOne scans these in C++;
    # the previous Python `for m in master_list` loop cost ~8.6ms per line against 9,305
    # masters, i.e. ~161s for a 18,610-line round on a dev box (many minutes on the hosted
    # tier) whenever lines missed the exact-match index — the round appeared frozen at 0%.
    master_choices = [m.part_number_normalized or "" for m in master_list]

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

        # Tier 2: fuzzy — single C++ pass over all master part numbers. score_cutoff lets
        # rapidfuzz abandon candidates early; anything below REVIEW_THRESHOLD is "unmatched"
        # either way, so cutting off there changes no outcome.
        best_score = 0.0
        best_master = None
        if pn and master_choices:
            hit = process.extractOne(
                pn, master_choices,
                scorer=fuzz.token_sort_ratio,
                score_cutoff=REVIEW_THRESHOLD,
            )
            if hit:
                _, best_score, best_idx = hit
                best_master = master_list[best_idx]

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
            # No candidate cleared REVIEW_THRESHOLD (the fuzzy pass cuts off there), so there
            # is no meaningful "best score" to quote — don't invent one.
            line.exception_notes = (
                f"No catalog item resembles '{line.raw_part_number or pn}' "
                f"(nothing scored above {REVIEW_THRESHOLD}% similarity)"
            )

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
