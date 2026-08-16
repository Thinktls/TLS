"""Row builders for the buyer results email (the "Items You Won" / "Items You Were Outbid" tables).

Kept in one place so the two code paths that send results — the auto-approve flow in
`routes/deals.py` and the manual "Send Results" endpoint in `routes/bid_rounds.py` — format every
item identically. A won item can come from a Deal (authoritative winner) or from the buyer's own
winning BidLine; both are supported.
"""
from app.services.normalizer import format_part_number, normalize_description


def won_item_from_deal(deal, master) -> dict:
    """A won row sourced from the authoritative Deal (used after award/override)."""
    return {
        "part_number": format_part_number(deal.part_number or (master.part_number if master else "")),
        "description": normalize_description((deal.description or (master.description if master else "")) or ""),
        "quantity": deal.quantity or (master.quantity if master else 1),
        "your_price": deal.winning_price,
    }


def won_item_from_line(line, master) -> dict:
    """A won row sourced from the buyer's own winning BidLine."""
    return {
        "part_number": format_part_number((master.part_number if master else line.raw_part_number) or ""),
        "description": normalize_description((master.description if master else line.description) or ""),
        "quantity": (master.quantity if master else line.quantity) or 1,
        "your_price": line.unit_price,
    }


def lost_item_from_line(line, master) -> dict:
    """An outbid row: the buyer's price plus the (fluffed) winning price shown to them."""
    return {
        "part_number": format_part_number((master.part_number if master else line.raw_part_number) or ""),
        "description": normalize_description((master.description if master else line.description) or ""),
        "quantity": (master.quantity if master else line.quantity) or 1,
        "your_price": line.unit_price,
        "winning_price": line.fluffed_loss_price,
    }
