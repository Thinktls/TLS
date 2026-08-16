"""The results-email row builders format part#/description/qty consistently and pull the model
quantity (not a stale per-line qty)."""
from types import SimpleNamespace
from app.services.results_email_items import (
    won_item_from_deal, won_item_from_line, lost_item_from_line,
)

_master = SimpleNamespace(part_number="h0h72108clar8000", description="hitachi h0h72108clar8000", quantity=55)


def test_won_from_deal_uses_deal_price_and_clean_format():
    deal = SimpleNamespace(part_number="h0h72108clar8000", description="hitachi h0h72108clar8000",
                           quantity=55, winning_price=136.62)
    row = won_item_from_deal(deal, _master)
    assert row == {"part_number": "H0H72108CLAR8000", "description": "Hitachi H0H72108CLAR8000",
                   "quantity": 55, "your_price": 136.62}


def test_won_from_line_uses_model_quantity_not_line_qty():
    line = SimpleNamespace(raw_part_number="H0H72108CLAR8000", description=None,
                           quantity=1, unit_price=136.62)
    row = won_item_from_line(line, _master)
    assert row["quantity"] == 55          # model qty, not the line's 1
    assert row["part_number"] == "H0H72108CLAR8000"
    assert row["your_price"] == 136.62


def test_lost_from_line_includes_winning_price():
    line = SimpleNamespace(raw_part_number="832414-b21", description="hpe 832414-b21 480gb sata ssd",
                           quantity=1, unit_price=120.0, fluffed_loss_price=136.62)
    row = lost_item_from_line(line, None)   # no master -> falls back to the line's own fields
    assert row["part_number"] == "832414-B21"
    assert row["description"] == "HPE 832414-B21 480GB SATA SSD"
    assert row["your_price"] == 120.0 and row["winning_price"] == 136.62
    assert row["quantity"] == 1
