"""The lot quantity a buyer bids on must come from the availability column, never a spec-qualified
count like "CPU Quantity". Regression for the server-file bug where qty showed 2 (CPUs/server)."""
import io
import pandas as pd
from app.services.file_parser import parse_buyer_file


def _parse(rows):
    buf = io.BytesIO()
    pd.DataFrame(rows).to_excel(buf, index=False)
    buf.seek(0)
    return parse_buyer_file(buf.read(), "bid.xlsx")


def test_avail_qty_wins_over_cpu_quantity():
    # Template-style file carrying both the real lot qty ("Avail Qty") and a CPU spec column.
    rows = [
        {"Part Number": "PROLIANT BL460C GEN9", "Description": "hp proliant bl460c gen9",
         "Avail Qty": 21, "CPU Quantity": 2, "Unit Price ($)": 50},
        {"Part Number": "SPARC T4-1", "Description": "sun oracle sparc t4-1",
         "Avail Qty": 5, "CPU Quantity": 2, "Unit Price ($)": 50},
    ]
    parsed = {r["raw_part_number"]: r["quantity"] for r in _parse(rows)}
    assert parsed["PROLIANT BL460C GEN9"] == 21
    assert parsed["SPARC T4-1"] == 5


def test_cpu_quantity_never_used_as_lot_quantity():
    # Only a spec-qualified count present -> must NOT be taken as the lot qty; defaults to 1.
    rows = [{"Part Number": "S2600WT2R", "Description": "intel s2600wt2r",
             "CPU Quantity": 2, "Unit Price": 50}]
    parsed = _parse(rows)
    assert parsed[0]["quantity"] == 1
