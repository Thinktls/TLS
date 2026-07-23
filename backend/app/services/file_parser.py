"""
Parse master files and buyer bid files.
Supports: .xlsx, .xls, .csv, .pdf, .docx, .doc

NO row limits — files of any size are parsed in full.
Auto-decodes column names via alias matching + rapidfuzz fuzzy fallback.
Tries every sheet (Excel) and every header row (all formats) so files
that don't match the standard template still parse correctly.

Designed to handle any IT hardware bid/inventory file from any company —
from tidy templates to ad-hoc spreadsheets with merged cells, leading notes,
pivot tables, and non-standard column names.
"""
import io
import logging
import re
from collections import Counter
import pandas as pd
from rapidfuzz import fuzz
from app.services.normalizer import normalize_part_number, normalize_description

logger = logging.getLogger(__name__)

# ── Column alias maps ─────────────────────────────────────────────────────────
# Comprehensive coverage of naming conventions across enterprise IT resellers,
# brokers, OEMs, and custom spreadsheets.

MASTER_COLUMN_ALIASES = {
    "part_number": [
        # Standard
        "part number", "part#", "part no", "partno", "part_number", "part no.",
        "part num", "part num.", "part id",
        # SKU / item codes
        "sku", "item number", "item#", "item no", "item no.", "item id",
        "item code", "product code", "product id", "product#", "product number",
        # Model / catalog
        "model", "model number", "model#", "model no", "model no.", "model id",
        "catalog number", "catalog#", "cat#", "cat no", "catalogue number",
        "reference", "ref#", "ref no", "reference number",
        # Manufacturer part
        "mfr part#", "mfr part number", "mfr part no", "mfr#",
        "manufacturer part", "manufacturer part#", "manufacturer part number",
        "oem part", "oem part#", "oem part number",
        "vendor part", "vendor part#", "vendor part number",
        # Shorthand
        "p/n", "pn", "p.n.", "mpn", "mfpn",
        # Barcode / asset
        "upc", "gtin", "ean", "isbn", "asset number", "asset#", "asset id", "asset tag",
        # ThinkTLS / industry-specific
        "drive part#", "drive part number",
        # Excel pivot row-label header (ThinkTLS memory bid sheets)
        "row labels", "row label", "labels",
    ],
    "description": [
        "description", "desc", "item description", "product name", "name",
        "product description", "item name", "product", "item",
        "model title", "model name", "item title", "title",
        "part description", "part name", "product title",
        "specification", "spec", "specs", "specifications",
        "details", "info", "information",
        "long description", "short description", "product details",
        "line description", "line item", "line item description",
        "commodity description",
        # NOTE: "grading description" / "grading notes" intentionally excluded —
        # those columns describe cosmetic grade, not the product itself, and must
        # map to "category" instead so grade text doesn't appear as the description.
    ],
    "manufacturer": [
        "manufacturer", "mfr", "mfg", "brand", "vendor", "make", "oem",
        "mfr name", "manufacturer name", "brand name", "supplier",
        "maker", "producer", "origin", "country of origin",
        "original equipment manufacturer",
    ],
    "quantity": [
        "quantity", "qty", "units", "count", "unit count",
        "total qty", "total quantity", "total units",
        "pieces", "pcs", "pc", "each", "no of units",
        "number of units", "number of items", "num units",
        "avail qty", "available qty", "available quantity",
        "stock qty", "stock", "inventory", "on hand",
        "lot size", "lot qty",
    ],
    "reserve_price": [
        "reserve price", "reserve", "floor price", "minimum price",
        "min price", "floor", "reserve_price",
        "minimum bid", "min bid", "starting price", "start price",
        "asking price", "list price", "msrp",
    ],
    "category": [
        "category", "cat", "type", "commodity", "product type",
        "grade", "final grade", "condition", "condition grade",
        # Cosmetic-grade column names come first — prefer "Grade A" over full description text.
        # "cosmetic grade" / "cosmetic" are common ThinkTLS column names for the letter grade.
        "cosmetic grade", "cosmetic", "quality grade", "quality",
        # Grading description columns come after so they only win when no short-grade column exists.
        "grading description", "grading notes", "grade description",
        "r2v3", "r2 grade",
    ],
}

BUYER_COLUMN_ALIASES = {
    "part_number": [
        # Standard
        "part number", "part#", "part no", "partno", "part_number", "part no.",
        "part num", "part id",
        # SKU / item codes
        "sku", "item number", "item#", "item no", "item no.", "item id",
        "item code", "product code", "product id", "product#", "product number",
        # Model / catalog
        "model", "model number", "model#", "model no", "model no.", "model id",
        "catalog number", "catalog#", "cat#", "reference", "ref#", "ref no",
        # Manufacturer part
        "mfr part#", "mfr part number", "mfr part no", "mfr#",
        "manufacturer part", "manufacturer part#", "manufacturer part number",
        "oem part#", "oem part number", "vendor part#",
        # Shorthand
        "p/n", "pn", "p.n.", "mpn",
        # ThinkTLS / industry-specific
        "drive part#", "drive part number",
        # Excel pivot row-label header (ThinkTLS memory bid sheets)
        "row labels", "row label", "labels",
    ],
    "description": [
        "description", "desc", "item description", "product", "product name",
        "product description", "item name", "name", "item",
        "model title", "model name", "item title", "title",
        "part description", "part name", "product title",
        "specification", "spec", "specs",
        "details", "notes", "long description",
        "line description", "line item description",
    ],
    "unit_price": [
        # Generic price
        "unit price", "price", "unit cost", "cost", "unit_price",
        # Bid / offer terminology
        "offer", "offer price", "your offer", "bid", "bid price",
        "your bid", "your price", "quote", "quoted price", "quote price",
        # Per-unit qualifiers
        "each", "ea", "per unit", "price per unit", "cost per unit",
        "price/unit", "cost/unit", "$/unit", "unit bid", "unit offer",
        # With currency/symbol
        "unit price ($)", "price ($)", "unit price(usd)", "unit price (usd)",
        "price (usd)", "cost ($)", "offer ($)",
        # Sales terminology
        "sell price", "selling price", "sale price", "net price",
        "buy price", "purchase price",
    ],
    "quantity": [
        "quantity", "qty", "units", "unit count", "total units",
        "pieces", "pcs", "count", "no of units",
        "your qty", "your quantity", "bid qty", "order qty",
        "requested qty", "demand", "volume", "amount",
    ],
    # Grade/condition — used when buyer submits a unit-level file (laptops, servers).
    # Cosmetic grade columns come first; long description columns are last fallback.
    "category": [
        "grade", "final grade", "condition", "condition grade",
        "cosmetic grade", "cosmetic", "quality grade", "quality",
        "grading description", "grading notes", "grade description",
        "r2v3", "r2 grade",
    ],
}

FUZZY_THRESHOLD = 72   # minimum rapidfuzz score for a column name to match

# How many leading rows to try as the header row.
# This is NOT a data row limit — all rows are always parsed regardless of file size.
# 15 covers files that have a title block, logo row, instruction rows, or blank rows
# before the actual column headers begin.
_HEADER_ROW_SCAN_DEPTH = 15

# Keywords that identify a column as grade/condition-related.
# Used to prevent grade columns from being mis-used as the item description in unit-level files.
# "Grading Description" fuzzy-matches the alias "description" (score ~73, just above threshold=72),
# so an explicit keyword guard is the most reliable defence.
_GRADE_COLUMN_KEYWORDS = {"grade", "grading", "cosmetic", "condition", "quality"}

def _is_grade_column(col_name: str) -> bool:
    """Return True if the column name is grade/condition-related, not a product description."""
    lower = col_name.lower()
    return any(k in lower for k in _GRADE_COLUMN_KEYWORDS)


# Columns that signal a unit-level (one-row-per-unit) inventory file
_SERIAL_ALIASES = [
    "serial", "serial number", "serial#", "serial no", "serial no.", "serialno",
    "uid", "uuid", "asset id", "asset#", "asset tag", "asset number",
    "barcode", "upc", "device id", "unit id",
]

# Rows that look like totals/footers — filter them out so they don't become bid lines
_JUNK_ROW_PREFIXES = (
    "total", "subtotal", "grand total", "sum", "totals", "sub total",
    "n/a", "na", "none", "tbd", "tbc", "see below", "continued",
)

# Columns in admin-uploaded files that are buyer-fill-in placeholders (Offer, Bid Unit, …).
# These carry no spec data and always contain zeros or blanks in the admin copy — exclude
# them from extra_columns so they don't pollute the generated bid template as locked columns.
_BUYER_PLACEHOLDER_COLS = {
    "offer", "offer ext", "offer ext.", "offer extended",
    "bid", "bid unit", "bid ext", "bid ext.", "bid extended",
    "bid price", "your bid", "your offer", "your price",
    "unit price", "unit price ($)", "price",
}


def _is_pivot_noise_col(col_name: str) -> bool:
    """Pivot-table aggregation columns like "Count of Model" / "Count of SKU" duplicate the
    Qty column and carry no product spec — they must never become locked spec columns in the
    generated bid template. Strips any pandas duplicate suffix (.1, .2) before matching."""
    c = re.sub(r"\.\d+$", "", str(col_name)).strip().lower()
    return c.startswith("count of ") or c in ("count of model", "count", "count of")

# Sheet name keywords — aggregated/summary tabs preferred; raw unit/detail tabs penalised.
_SHEET_BONUS_KEYWORDS = [
    "summary", "overview", "bid", "quote", "price list", "pricing",
    "offer", "rfq", "items", "products", "parts", "catalog", "catalogue",
]
_SHEET_PENALTY_KEYWORDS = [
    "detail", "unit list", "serial list", "inventory detail",
    "raw data", "raw", "units", "serials", "individual",
]


def _sheet_score_bonus(sheet_name: str) -> int:
    name = sheet_name.lower()
    if any(k in name for k in _SHEET_BONUS_KEYWORDS):
        return 3
    if any(k in name for k in _SHEET_PENALTY_KEYWORDS):
        return -2
    return 0


# Extra score awarded to a side-by-side pivot bid table (e.g. the ThinkTLS memory
# "Bid Tables" sheet). A pivot layout with dedicated bid-entry columns is a deliberate,
# curated bid sheet — it must win over the same workbook's raw unit-level detail sheets,
# which otherwise tie on field count and can win by candidate order alone.
# Must stay clear of _UNIT_LEVEL_SHEET_BONUS so a pivot bid sheet still beats a sibling
# unit-level detail sheet in the same workbook (under BOTH the master and buyer alias maps,
# which score sheets differently).
_PIVOT_BLOCK_BONUS = 10

# Extra score for a sheet that is unit-level — one row per physical unit, carrying its own
# Serial/UID. When a workbook has both an aggregated "Summary" sheet and a per-unit "Detail"
# sheet (the ThinkTLS drive and memory files have exactly this shape), the detail sheet is the
# complete data: every unit, plus UID/Serial/Condition. The summary collapses ~15 drives into
# one model row, which loses the per-unit identifiers entirely.
# ThinkTLS require that whatever the admin uploads reaches the buyer intact — never cut down —
# and that every template behave like the (already unit-level) server file, so the per-unit
# sheet must win over the summary despite the summary's name bonus.
#
# It must also be big enough that the MASTER and BUYER alias maps agree on the same sheet.
# They score differently: only the buyer map has a `unit_price` field, so a summary sheet's
# "Offer" column earns it an extra point that the master map never sees. At a smaller bonus
# the master picked "Memory Detail" (9,305 units) while the buyer picked "Memory Summary"
# (230 models) out of the SAME workbook — so no bid line could ever match a master item, and
# every one of them fell through to the expensive fuzzy tier. Both maps must land on the
# per-unit sheet.
_UNIT_LEVEL_SHEET_BONUS = 6


def _cell_text(val) -> str:
    """Normalise a cell to display text, mapping pandas' empty markers to "".

    Extra columns keep an entry for EVERY source column on EVERY row, blanks included.
    Dropping blank cells made a column's position in the generated template depend on which
    row happened to hold the first value — e.g. "Drive bays" is empty on the first server, so
    it was pushed to the end of the template instead of sitting where the admin's file has it.
    Worse, a column blank on every scanned row vanished from the buyer's template entirely.
    """
    text = str(val).strip()
    return "" if text in ("nan", "None", "NaT") else text


def _is_junk_row(pn_val: str) -> bool:
    """Return True for total/footer rows that should be skipped."""
    v = pn_val.lower().strip().rstrip(":")
    return v in _JUNK_ROW_PREFIXES or v.startswith(("total", "grand total", "subtotal"))


# ── public API ────────────────────────────────────────────────────────────────

def parse_master_file(file_bytes: bytes, filename: str) -> list[dict]:
    df = _load_dataframe(file_bytes, filename, MASTER_COLUMN_ALIASES)
    mapping = _map_columns(df, MASTER_COLUMN_ALIASES)

    # Unit-level laptop/inventory files: group by (part_number_or_description, grade) → synthesise master items
    if _is_unit_level(df) and ("part_number" in mapping or "description" in mapping):
        return _aggregate_unit_level(df, mapping)

    if "part_number" not in mapping:
        raise ValueError(
            "Could not find a part number column. "
            "Expected headers like: 'Part Number', 'SKU', 'Part#', 'P/N', 'Model Number'."
        )

    # Capture any columns not consumed by standard field mapping so spec data
    # (CPU, Memory, Storage, etc.) flows through to master_items.extra_columns
    # and eventually into the generated bid template — mirroring the behaviour
    # already present on the unit-level and buyer-file paths.
    # Exclude buyer-placeholder columns (Offer, Bid Unit, Offer Ext, …): these are
    # always zero/blank in admin-uploaded files and add noise to the bid template.
    mapped_master_cols = set(mapping.values())
    # Strip pandas duplicate-column suffixes (.1, .2, …) for comparison purposes so that
    # "Row Labels.1" is excluded when "Row Labels" is already a mapped field, and
    # "Bid Ext.1" is excluded when "Bid Ext" is in the placeholder set.
    _strip_col_suffix = lambda c: re.sub(r"\.\d+$", "", c).strip()
    _mapped_base = {_strip_col_suffix(c).lower() for c in mapped_master_cols}
    extra_master_col_names = [
        c for c in df.columns
        if c not in mapped_master_cols
        and c.lower().strip() not in _BUYER_PLACEHOLDER_COLS
        and _strip_col_suffix(c).lower() not in _BUYER_PLACEHOLDER_COLS
        and _strip_col_suffix(c).lower() not in _mapped_base
        and not _is_pivot_noise_col(c)
    ]

    rows = []
    for idx, row in df.iterrows():
        raw_pn = str(row.get(mapping["part_number"], "")).strip()
        if not raw_pn or raw_pn.lower() in ("nan", "none", "") or _is_junk_row(raw_pn):
            continue
        extra = {
            col: _cell_text(row.get(col, ""))
            for col in extra_master_col_names
        }
        rows.append({
            "part_number": raw_pn,
            "part_number_normalized": normalize_part_number(raw_pn),
            "description": normalize_description(str(row.get(mapping.get("description", ""), ""))),
            "manufacturer": str(row.get(mapping.get("manufacturer", ""), "")).strip(),
            "quantity": _safe_int(row.get(mapping.get("quantity", ""), 1)),
            "reserve_price": _safe_float(row.get(mapping.get("reserve_price", ""), None)),
            "category": str(row.get(mapping.get("category", ""), "")).strip(),
            "extra_columns": extra if extra else None,
            "row_number": int(idx) + 2,
        })

    # Consolidate duplicate normalized part numbers: sum quantities, keep lowest reserve price.
    # When the same PN appears multiple times with different extra spec values, merge the dicts
    # so no spec column is silently dropped — first-seen values are kept for conflicts.
    consolidated: dict[str, dict] = {}
    for row in rows:
        key = row["part_number_normalized"]
        if key in consolidated:
            existing = consolidated[key]
            existing["quantity"] = (existing["quantity"] or 0) + (row["quantity"] or 0)
            if row["reserve_price"] is not None:
                if existing["reserve_price"] is None or row["reserve_price"] < existing["reserve_price"]:
                    existing["reserve_price"] = row["reserve_price"]
            # Merge extra_columns: keep the first-seen VALUE for a column, but let a later row
            # fill a column the first row left blank. Every row now carries every column (blank
            # ones as ""), so a plain dict merge would let that "" mask a real value further
            # down — the first row wins on presence, not on emptiness.
            if row.get("extra_columns"):
                merged = dict(existing["extra_columns"] or {})
                for col, val in (row["extra_columns"] or {}).items():
                    if val and not merged.get(col):
                        merged[col] = val
                existing["extra_columns"] = merged or None
        else:
            consolidated[key] = row.copy()

    result = list(consolidated.values())

    # For Summary-style files (Drive Summary / Memory Summary) the chosen sheet only has
    # Model+Qty+Offer columns — no Description or Manufacturer.  Pull those from any sibling
    # Detail sheet in the same workbook so the generated bid template shows meaningful labels.
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("xlsx", "xls"):
        _enrich_descriptions_from_excel(file_bytes, filename, result)

    return result


def _is_unit_level(df: pd.DataFrame) -> bool:
    """Return True if the DataFrame has a serial/UID column (one row per physical unit)."""
    col = _find_column(df, _SERIAL_ALIASES)
    # Don't let fuzzy matching pick a buyer-placeholder column (e.g. "Bid Unit" ≈ "unit id")
    # as the serial identifier — those are price-fill columns, not unique per-unit IDs.
    if col is not None and col.lower().strip() in _BUYER_PLACEHOLDER_COLS:
        col = None
    return col is not None


def _all_identifier_columns(df: pd.DataFrame) -> set[str]:
    """Return every column that is a unique-per-unit identifier (Serial, UID, asset tag, ...).
    A file can have more than one such column (e.g. both "UID" and "Serial") — all must be
    excluded from spec fingerprinting, since by definition every value differs per row and
    would otherwise make every unit look like a distinct configuration."""
    cols_lower = {c.lower().strip(): c for c in df.columns}
    return {cols_lower[alias] for alias in _SERIAL_ALIASES if alias in cols_lower}


def _aggregate_unit_level(df: pd.DataFrame, mapping: dict) -> list[dict]:
    """
    Convert a unit-level inventory file (one row per physical unit — laptops, servers,
    desktops) into one master-item row per unit. NO grouping or merging: every valid data
    row in the file becomes exactly one line item, quantity always 1. This is deliberate —
    silently summing "duplicate" units into one line with quantity > 1 previously hid real
    differences between units and caused exactly the line-count mismatches this function
    now avoids entirely (e.g. a 100-unit file must always produce 100 line items).

    The unit's serial/UID column is appended to the part number to guarantee uniqueness
    even when many rows share the same Model — and because a Serial/UID is stable content
    (not row position), the buyer's submitted copy of the same file lines up with these
    master items regardless of row order.
    """
    pn_col = mapping.get("part_number")
    desc_col = mapping.get("description")
    grade_col = mapping.get("category")  # "grade" / "final grade" / "condition" maps to category
    mfr_col = mapping.get("manufacturer")
    reserve_col = mapping.get("reserve_price")
    id_cols = sorted(_all_identifier_columns(df))  # e.g. both "UID" and "Serial" — use whichever is populated

    # Need at least one of: part_number or description column to identify each unit
    if not pn_col and not desc_col:
        raise ValueError("Unit-level file has no part number or description column.")

    # Two kinds of column are excluded:
    #  - the reserve price: admin-only (the floor price buyers must never see);
    #  - the buyer's own price-entry box ("Offer", "Bid Unit", …): it is blank in the admin's
    #    file and the template already provides it as the editable "Unit Price ($)" column, so
    #    carrying it through would render a dead, locked duplicate next to the real one.
    # Every other original column (model/title, UID/serial, grade, manufacturer, all spec
    # columns) flows into extra_columns with its EXACT original name and in the original
    # column order, so the generated buyer template mirrors the admin file column-for-column
    # with no renaming and no columns combined or hidden.
    # Columns excluded from the model-level spec view:
    #  - reserve price (admin-only floor);
    #  - buyer price placeholders ("Offer"/"Bid Unit") and pivot noise;
    #  - the per-device identifier columns (Serial, UID, …): they differ for every device, so
    #    they can't sit on a single consolidated model row — they move into unit_details.
    system_only = {reserve_col} if reserve_col else set()
    id_col_set = set(id_cols)
    # Columns already surfaced as standard fields (part number, description, manufacturer, grade)
    # must not be repeated as spec columns, or the template shows "Part Number"/"Description"
    # twice — once as a fixed header, once as an extra column.
    mapped_cols = {c for c in (pn_col, desc_col, mfr_col, grade_col) if c}
    extra_col_names = [
        c for c in df.columns
        if c not in system_only
        and c not in id_col_set
        and c not in mapped_cols
        and re.sub(r"\.\d+$", "", str(c)).strip().lower() not in _BUYER_PLACEHOLDER_COLS
        and not _is_pivot_noise_col(c)
    ]

    # Consolidate by MODEL: one master item per distinct model, quantity = number of physical
    # devices, with each device's Serial/UID kept in unit_details. ThinkTLS bid at the model
    # level — "qty (8) 15-13079-02", not 8 separate lines — and the per-device identifiers are
    # only needed later for the per-winner Razor output, which expands a won model back to its
    # devices.
    groups: dict[str, dict] = {}
    for row_idx, (_, row) in enumerate(df.iterrows(), start=1):
        if pn_col:
            label = str(row.get(pn_col, "")).strip()
            if not label or label.lower() in ("nan", "none", "") or _is_junk_row(label):
                continue
        else:
            label = normalize_description(str(row.get(desc_col, "")).strip())
            if not label or label.lower() in ("nan", "none", "") or _is_junk_row(label):
                continue

        norm = normalize_part_number(label)
        # Per-device record for output expansion — the serial/uid identifier columns by name.
        device = {c: _cell_text(row.get(c, "")) for c in id_cols if _cell_text(row.get(c, ""))}

        g = groups.get(norm)
        if g is None:
            if desc_col and not _is_grade_column(desc_col) and desc_col != grade_col:
                desc_val = normalize_description(str(row.get(desc_col, "")).strip())
            else:
                desc_val = normalize_description(label)
            grade = str(row.get(grade_col, "")).strip() if grade_col else ""
            if grade.lower() in ("nan", "none", ""):
                grade = ""
            extra = {col: _cell_text(row.get(col, "")) for col in extra_col_names}
            g = groups[norm] = {
                "part_number": label,
                "part_number_normalized": norm,
                "description": desc_val,
                "manufacturer": str(row.get(mfr_col, "")).strip() if mfr_col else "",
                "quantity": 0,
                "reserve_price": _safe_float(row.get(reserve_col)) if reserve_col else None,
                "category": grade,
                "extra_columns": extra if extra else None,
                "unit_details": [],
                "row_number": row_idx,
            }
        g["quantity"] += 1
        if device:
            g["unit_details"].append(device)
        # Fill any model-level spec left blank on the first device from a later one.
        if g["extra_columns"] is not None:
            for col in extra_col_names:
                if not g["extra_columns"].get(col):
                    v = _cell_text(row.get(col, ""))
                    if v:
                        g["extra_columns"][col] = v

    rows = list(groups.values())
    for g in rows:
        if not g["unit_details"]:
            g["unit_details"] = None
    logger.info(
        "[file_parser] unit-level file: %d device rows → %d models (consolidated, qty summed)",
        len(df), len(rows),
    )
    return rows


def parse_buyer_file(file_bytes: bytes, filename: str) -> list[dict]:
    df = _load_dataframe(file_bytes, filename, BUYER_COLUMN_ALIASES)
    mapping = _map_columns(df, BUYER_COLUMN_ALIASES)

    if "part_number" not in mapping:
        raise ValueError(
            "Could not find a part number column. "
            "Expected headers like: 'Part Number', 'SKU', 'Part#', 'P/N', 'Model'."
        )
    if "unit_price" not in mapping:
        # Most often this is the raw inventory workbook rather than the bid template — the
        # inventory sheets list every unit but have nowhere to enter a price. Point the buyer
        # at the template instead of just naming header spellings at them.
        raise ValueError(
            "This file has no price column, so there's nothing to bid with. "
            "Download the Bid Template for this round, enter your prices in the "
            "'Unit Price ($)' column, and upload that file. "
            "(A price column may also be named 'Price', 'Bid Price', 'Offer' or 'Cost'.)"
        )

    # Unit-level buyer files (ThinkTLS laptops, servers, desktops): one row per physical unit.
    # Group by (model, grade) — same synthesis as admin upload — so bid lines match master items.
    if _is_unit_level(df):
        return _aggregate_buyer_unit_level(df, mapping)

    # Columns not covered by standard mapping — preserved so buyers see all their data.
    # Exclude pivot-count noise ("Count of Model") and per-line extension columns ("Bid Ext",
    # "Offer Ext") so a re-uploaded pivot bid file doesn't carry those artifacts as spec data.
    mapped_cols = set(mapping.values())
    _strip_suffix = lambda c: re.sub(r"\.\d+$", "", c).strip().lower()
    extra_col_names = [
        c for c in df.columns
        if c not in mapped_cols
        and _strip_suffix(c) not in _BUYER_PLACEHOLDER_COLS
        and not _is_pivot_noise_col(c)
    ]

    rows = []
    for idx, row in df.iterrows():
        raw_pn = str(row.get(mapping["part_number"], "")).strip()
        if not raw_pn or raw_pn.lower() in ("nan", "none", "") or _is_junk_row(raw_pn):
            continue
        unit_price = _safe_float(row.get(mapping["unit_price"]))
        qty = _safe_int(row.get(mapping.get("quantity", ""), 1))
        extra = {
            col: str(row.get(col, "")).strip()
            for col in extra_col_names
            if str(row.get(col, "")).strip() not in ("", "nan", "None")
        }
        rows.append({
            "raw_part_number": raw_pn,
            "normalized_part_number": normalize_part_number(raw_pn),
            "description": normalize_description(str(row.get(mapping.get("description", ""), ""))),
            "category": str(row.get(mapping.get("category", ""), "")).strip() or None,
            "unit_price": unit_price,
            "quantity": qty,
            "total_price": round(unit_price * qty, 4) if unit_price else None,
            "row_number": int(idx) + 2,
            "extra_columns": extra if extra else None,
        })

    # Consolidate duplicate part numbers: sum quantities, keep the lowest (most competitive) price.
    # Merge extra_columns so spec data from later rows fills keys missing in the first-seen row.
    consolidated: dict[str, dict] = {}
    for row in rows:
        key = row["normalized_part_number"]
        if key in consolidated:
            existing = consolidated[key]
            existing["quantity"] = (existing["quantity"] or 0) + (row["quantity"] or 0)
            if row["unit_price"] is not None:
                if existing["unit_price"] is None or row["unit_price"] < existing["unit_price"]:
                    existing["unit_price"] = row["unit_price"]
            existing["total_price"] = (
                round(existing["unit_price"] * existing["quantity"], 4)
                if existing["unit_price"] is not None else None
            )
            if row.get("extra_columns"):
                merged = {**(row["extra_columns"] or {}), **(existing["extra_columns"] or {})}
                existing["extra_columns"] = merged or None
        else:
            consolidated[key] = row.copy()

    return list(consolidated.values())


def _aggregate_buyer_unit_level(df: pd.DataFrame, mapping: dict) -> list[dict]:
    """
    For a buyer file that is still per-device (a raw inventory file with a price column, rather
    than the consolidated bid template). Consolidate by MODEL to mirror the master side: one bid
    line per model, quantity = number of priced devices, unit_price = the model's price. Buyers
    bid one price for the whole model — "qty (8) 15-13079-02" — so a per-device file just repeats
    that price; we take the model's non-blank price (min if they somehow differ).
    """
    pn_col = mapping["part_number"]
    price_col = mapping["unit_price"]
    desc_col = mapping.get("description")
    grade_col = mapping.get("category")
    id_cols = set(_all_identifier_columns(df))

    # Exclude the price column and the per-device identifier columns from the model-level spec.
    system_only = {price_col} if price_col else set()
    extra_col_names = [
        c for c in df.columns
        if c not in system_only and c not in id_cols
        and str(c).strip().lower() not in _BUYER_PLACEHOLDER_COLS
        and not _is_pivot_noise_col(c)
    ]

    groups: dict[str, dict] = {}
    for row_idx, (_, row) in enumerate(df.iterrows(), start=1):
        label = str(row.get(pn_col, "")).strip()
        if not label or label.lower() in ("nan", "none", "") or _is_junk_row(label):
            continue
        price = _safe_float(row.get(price_col))
        norm = normalize_part_number(label)

        g = groups.get(norm)
        if g is None:
            grade = str(row.get(grade_col, "") if grade_col else "").strip()
            if grade.lower() in ("nan", "none", ""):
                grade = ""
            if desc_col and not _is_grade_column(desc_col) and desc_col != grade_col:
                desc = normalize_description(str(row.get(desc_col, "")).strip())
            else:
                desc = normalize_description(label)
            extra = {
                col: _cell_text(row.get(col, "")) for col in extra_col_names
                if _cell_text(row.get(col, ""))
            }
            g = groups[norm] = {
                "raw_part_number": label,
                "normalized_part_number": norm,
                "description": desc or label,
                "category": grade or None,
                "unit_price": price,
                "quantity": 0,
                "total_price": None,
                "row_number": row_idx,
                "extra_columns": extra if extra else None,
            }
        g["quantity"] += 1
        if price is not None and (g["unit_price"] is None or price < g["unit_price"]):
            g["unit_price"] = price

    rows = list(groups.values())
    for g in rows:
        g["total_price"] = round(g["unit_price"] * g["quantity"], 4) if g["unit_price"] is not None else None

    logger.info(
        "[file_parser] buyer unit-level file: %d device rows → %d models (%d priced)",
        len(df), len(rows), sum(1 for r in rows if r["unit_price"] is not None),
    )
    return rows


# ── internal helpers ──────────────────────────────────────────────────────────

def _find_column(df: pd.DataFrame, aliases: list[str]) -> str | None:
    cols_lower = {c.lower().strip(): c for c in df.columns}

    # 1. Exact match
    for alias in aliases:
        if alias in cols_lower:
            return cols_lower[alias]

    # 2. Fuzzy fallback — pick best scoring column above threshold
    best_col, best_score = None, 0
    for alias in aliases:
        for col_lower, col_orig in cols_lower.items():
            score = fuzz.token_sort_ratio(alias, col_lower)
            if score >= FUZZY_THRESHOLD and score > best_score:
                best_score = score
                best_col = col_orig
    return best_col


def _map_columns(df: pd.DataFrame, alias_map: dict) -> dict:
    return {
        field: col
        for field, aliases in alias_map.items()
        if (col := _find_column(df, aliases))
    }


def _score_df(df: pd.DataFrame, alias_map: dict) -> int:
    """Count how many fields from alias_map can be identified in df."""
    return sum(1 for aliases in alias_map.values() if _find_column(df, aliases))


# ── format loaders ────────────────────────────────────────────────────────────

def _load_dataframe(file_bytes: bytes, filename: str, hint_aliases: dict) -> pd.DataFrame:
    """
    Load the best-matching DataFrame from the given file.
    Tries every sheet (Excel) and every header row for all formats.
    Falls back to content sniffing for unknown extensions.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in ("xlsx", "xls"):
        candidates = _candidates_excel(io.BytesIO(file_bytes), ext, hint_aliases)
        candidates += _candidates_pivot_excel(io.BytesIO(file_bytes), ext, hint_aliases)
    elif ext == "csv":
        candidates = _candidates_csv(file_bytes)
    elif ext == "pdf":
        candidates = _candidates_pdf(io.BytesIO(file_bytes))
    elif ext in ("docx", "doc"):
        candidates = _candidates_word(io.BytesIO(file_bytes))
    else:
        # Unknown extension — try all loaders
        candidates = (
            _candidates_excel(io.BytesIO(file_bytes), "xlsx", hint_aliases)
            + _candidates_csv(file_bytes)
            + _candidates_pdf(io.BytesIO(file_bytes))
            + _candidates_word(io.BytesIO(file_bytes))
        )

    if not candidates:
        raise ValueError(
            f"Could not extract any tabular data from '{filename}'. "
            "Supported formats: Excel (.xlsx/.xls), CSV, PDF, Word (.docx/.doc)."
        )

    # For Excel: deduplicate candidates to ONE best parse per sheet before selection.
    # Without this, the same sheet appears up to _HEADER_ROW_SCAN_DEPTH times (one per
    # header-row attempt) and the merge step would concat the same data many times.
    if ext in ("xlsx", "xls"):
        per_sheet: dict[str, pd.DataFrame] = {}
        for df in candidates:
            sheet = df.attrs.get("_sheet_name", "__csv__")
            score = _score_df(df, hint_aliases) + df.attrs.get("_sheet_bonus", 0)
            prev = per_sheet.get(sheet)
            if prev is None:
                per_sheet[sheet] = df
            else:
                prev_score = _score_df(prev, hint_aliases) + prev.attrs.get("_sheet_bonus", 0)
                if score > prev_score:
                    per_sheet[sheet] = df

        # A sheet that was split into ≥2 side-by-side pivot blocks must NOT also contribute its
        # flattened whole-sheet parse. Flattening a multi-section pivot only captures the first
        # section (mapping "Row Labels"/"Qty" to section 0 and suffixing the rest .1/.2/…), so
        # merging that flattened copy back with the blocks double-counts section 0's quantities
        # and injects duplicate junk columns. The pivot blocks are the correct decomposition —
        # drop the plain candidate for those sheets. (A lone false-positive block, i.e. a normal
        # table with one stray empty column, keeps its plain candidate — only ≥2 blocks qualify.)
        pivot_block_counts = Counter(
            name.split("__pivot")[0] for name in per_sheet if "__pivot" in name
        )
        for base, cnt in pivot_block_counts.items():
            if cnt >= 2:
                per_sheet.pop(base, None)

        candidates = list(per_sheet.values())
        logger.info("[file_parser] Excel sheets found: %s", list(per_sheet.keys()))

    best = max(candidates, key=lambda df: _score_df(df, hint_aliases) + df.attrs.get("_sheet_bonus", 0))

    # For multi-sheet Excel files: merge sheets that have the same DETECTABLE FIELDS
    # (e.g., "Laptop Bid Lot" + "Desktop Bid Lot" with identical structures).
    # Compare by detected field keys, not raw column names — so "Part #" and "Part Number"
    # on different sheets both detected as part_number are correctly merged.
    if ext in ("xlsx", "xls"):
        best_fields = set(_map_columns(best, hint_aliases).keys())
        best_bonus  = best.attrs.get("_sheet_bonus", 0)
        same_struct = [
            df for df in candidates
            if df is not best
            and set(_map_columns(df, hint_aliases).keys()) == best_fields
            and df.attrs.get("_sheet_bonus", 0) == best_bonus
        ]
        if same_struct:
            _bonus = best.attrs.get("_sheet_bonus", 0)
            best = pd.concat([best] + same_struct, ignore_index=True)
            best.attrs["_sheet_bonus"] = _bonus
            logger.info("[file_parser] merged %d same-structure sheets", 1 + len(same_struct))

    return best


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df.dropna(how="all")


def _visible_sheet_names(xf: pd.ExcelFile) -> list[str]:
    """Skip hidden/very-hidden sheets. Real-world files often keep a hidden "Master Sheet"
    that's a full rollup of every other tab (e.g. a hidden 1818-row sheet alongside 9 visible
    per-rack breakdown tabs covering the same 1818 units) — ingesting both doubles every line.
    A sheet hidden by the file's author is a strong signal it isn't meant for ingestion."""
    try:
        wb = xf.book  # openpyxl Workbook — only available with engine="openpyxl" (.xlsx)
        return [s for s in xf.sheet_names if getattr(wb[s], "sheet_state", "visible") == "visible"]
    except Exception:
        return list(xf.sheet_names)


def _candidates_excel(buf: io.BytesIO, ext: str, hint_aliases: dict) -> list[pd.DataFrame]:
    """Return ONE candidate per sheet: the sheet parsed at its best-scoring header row.

    This used to fully parse every sheet once per header-row guess — 15 complete parses of
    every sheet. On the real ThinkTLS memory file (a 9,305-row "Memory Detail" sheet) that
    cost ~4.1s of a 5.4s upload on a fast dev box, and on Render's shared CPU it ran past the
    frontend's 35s HTTP timeout. A timed-out upload returns no response body, so the UI fell
    back to its generic "Upload failed — check file format" message even though the file
    parsed perfectly — which is exactly why only the largest file appeared to be "invalid".

    Now: peek at just the first rows to score each candidate header row (scoring only ever
    inspects column NAMES, never the data), then do a single full parse of the winning row.
    The chosen frame is produced by the same xf.parse(sheet, header=N) call as before, so
    dtypes and values are identical — only the 14 redundant parses per sheet are gone.
    """
    out = []
    try:
        engine = "openpyxl" if ext == "xlsx" else None
        xf = pd.ExcelFile(buf, engine=engine)
        for sheet in _visible_sheet_names(xf):
            bonus = _sheet_score_bonus(sheet)
            try:
                peek = xf.parse(sheet, header=None, nrows=_HEADER_ROW_SCAN_DEPTH + 1)
            except Exception:
                continue
            if peek.empty:
                continue

            depth = min(_HEADER_ROW_SCAN_DEPTH, len(peek))
            scores: dict[int, int] = {}
            for hdr in range(depth):
                names = [str(v).strip() for v in peek.iloc[hdr].tolist()]
                # _score_df -> _find_column only reads df.columns, so an empty frame carrying
                # these names scores exactly as the fully-parsed frame would.
                scores[hdr] = _score_df(pd.DataFrame(columns=names), hint_aliases)

            # Best score wins; ties resolve to the earliest header row — matching the previous
            # "first candidate with the highest score" de-duplication behaviour exactly.
            for hdr in sorted(range(depth), key=lambda h: (-scores[h], h)):
                try:
                    df = _clean(xf.parse(sheet, header=hdr))
                except Exception:
                    continue
                # Fall through to the next-best header row only if this one yields no usable
                # table, mirroring the old loop which simply skipped empty parses.
                if len(df) > 0 and len(df.columns) > 1:
                    # The unit-level bonus depends on the sheet's COLUMNS, so it can only be
                    # judged once the sheet is actually parsed.
                    unit_bonus = _UNIT_LEVEL_SHEET_BONUS if _is_unit_level(df) else 0
                    df.attrs["_sheet_bonus"] = bonus + unit_bonus
                    df.attrs["_sheet_name"] = sheet  # used for deduplication
                    out.append(df)
                    break
    except Exception as e:
        logger.warning("Excel parse error: %s", e)
    return out


def _candidates_pivot_excel(buf: io.BytesIO, ext: str, hint_aliases: dict) -> list[pd.DataFrame]:
    """
    Detect side-by-side pivot tables (e.g. ThinkTLS memory bid sheets).
    A pivot layout has multiple header-like rows within the same sheet separated
    by blank columns.  We find all-NaN column gaps, split on them, and treat each
    block as an independent candidate DataFrame.
    """
    out = []
    try:
        engine = "openpyxl" if ext == "xlsx" else None
        xf = pd.ExcelFile(buf, engine=engine)
        for sheet in _visible_sheet_names(xf):
            try:
                raw = xf.parse(sheet, header=None)
            except Exception:
                continue
            if raw.empty or len(raw.columns) < 4:
                continue

            # Find column indices where the entire column is NaN (gap columns)
            all_nan_cols = [c for c in raw.columns if raw[c].isna().all()]
            if not all_nan_cols:
                continue

            # Build contiguous gap ranges and split
            gap_ranges: list[tuple[int, int]] = []
            start = all_nan_cols[0]
            prev = start
            for c in all_nan_cols[1:]:
                if c == prev + 1:
                    prev = c
                else:
                    gap_ranges.append((start, prev))
                    start = c
                    prev = c
            gap_ranges.append((start, prev))

            # Column slices between gaps
            col_indices = list(raw.columns)
            slices: list[list] = []
            cursor = 0
            for gap_start, gap_end in gap_ranges:
                block = [c for c in col_indices[cursor:] if c < gap_start]
                if block:
                    slices.append(block)
                cursor = col_indices.index(gap_end) + 1
            tail = col_indices[cursor:]
            if tail:
                slices.append(tail)

            for block_idx, block_cols in enumerate(slices):
                if len(block_cols) < 2:
                    continue
                block = raw[block_cols].copy()
                for hdr in range(min(_HEADER_ROW_SCAN_DEPTH, len(block))):
                    try:
                        header_row = block.iloc[hdr].tolist()
                        data = block.iloc[hdr + 1:].copy()
                        data.columns = [str(h).strip() if str(h).lower() not in ("nan", "none") else f"col_{i}"
                                         for i, h in enumerate(header_row)]
                        df = _clean(data.reset_index(drop=True))
                        if len(df) > 0 and len(df.columns) > 1 and _score_df(df, hint_aliases) > 0:
                            # Tag with a key unique per (sheet, block) — distinct from the plain
                            # _candidates_excel candidate for this same sheet, so the per-sheet
                            # dedup in _load_dataframe never collapses or collides the two.
                            df.attrs["_sheet_bonus"] = _sheet_score_bonus(sheet) + _PIVOT_BLOCK_BONUS
                            df.attrs["_sheet_name"] = f"{sheet}__pivot{block_idx}"
                            out.append(df)
                            break
                    except Exception:
                        pass
    except Exception as e:
        logger.warning("Pivot Excel parse error: %s", e)
    return out


def _candidates_csv(file_bytes: bytes) -> list[pd.DataFrame]:
    out = []
    for encoding in ("utf-8", "latin-1", "cp1252"):
        for hdr in range(_HEADER_ROW_SCAN_DEPTH):
            try:
                df = _clean(pd.read_csv(
                    io.BytesIO(file_bytes),
                    header=hdr,
                    encoding=encoding,
                    on_bad_lines="skip",
                ))
                if len(df) > 0 and len(df.columns) > 1:
                    out.append(df)
                    break  # good parse for this encoding — skip remaining header rows
            except Exception:
                pass
        if out:
            break  # found a valid encoding
    return out


def _candidates_pdf(buf: io.BytesIO) -> list[pd.DataFrame]:
    out = []
    try:
        import pdfplumber
        with pdfplumber.open(buf) as pdf:
            combined_rows: list[list] = []
            header: list[str] | None = None

            for page in pdf.pages:
                for table in (page.extract_tables() or []):
                    if not table:
                        continue
                    if header is None:
                        header = [
                            str(c).strip() if c else f"col_{i}"
                            for i, c in enumerate(table[0])
                        ]
                        combined_rows.extend(table[1:])
                    else:
                        combined_rows.extend(table)

            if header and combined_rows:
                ncols = len(header)
                padded = [
                    (r + [""] * ncols)[:ncols] for r in combined_rows
                ]
                df = _clean(pd.DataFrame(padded, columns=header))
                if len(df) > 0:
                    out.append(df)

    except ImportError:
        logger.warning(
            "pdfplumber not installed — PDF parsing unavailable. "
            "Install with: pip install pdfplumber"
        )
    except Exception as e:
        logger.warning("PDF parse error: %s", e)
    return out


def _candidates_word(buf: io.BytesIO) -> list[pd.DataFrame]:
    out = []
    try:
        from docx import Document
        doc = Document(buf)
        for table in doc.tables:
            if len(table.rows) < 2:
                continue
            rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
            header, data = rows[0], rows[1:]
            try:
                df = _clean(pd.DataFrame(data, columns=header))
                if len(df) > 0:
                    out.append(df)
            except Exception:
                pass
    except ImportError:
        logger.warning(
            "python-docx not installed — Word parsing unavailable. "
            "Install with: pip install python-docx"
        )
    except Exception as e:
        logger.warning("Word parse error: %s", e)
    return out


# ── description enrichment ────────────────────────────────────────────────────

def _enrich_descriptions_from_excel(file_bytes: bytes, filename: str, items: list[dict]) -> None:
    """
    For Summary-only files (e.g. ThinkTLS Drive Bid, Memory files) whose chosen sheet
    has no Description or Manufacturer column, look for a sibling Detail/inventory sheet
    in the same workbook that does.  Build a lookup keyed by normalized part number and
    fill blank description/manufacturer fields in-place.  Stops after the first sheet
    that successfully enriches at least one item.
    """
    blank_desc_count = sum(1 for r in items if not (r.get("description") or "").strip())
    if blank_desc_count < len(items) * 0.5:
        return  # majority already have descriptions — nothing to do

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    engine = "openpyxl" if ext == "xlsx" else None
    try:
        xf = pd.ExcelFile(io.BytesIO(file_bytes), engine=engine)
    except Exception:
        return

    # Scan ALL sheets first, accumulating lookup dicts — files like the ThinkTLS Feb
    # Memory workbook have one inventory sheet per DIMM capacity category, so a single
    # sheet only covers a fraction of the master items.
    master_norms = {item["part_number_normalized"] for item in items}
    desc_lookup: dict[str, str] = {}
    mfr_lookup:  dict[str, str] = {}

    for sheet in _visible_sheet_names(xf):
        try:
            raw = xf.parse(sheet, header=None, nrows=5)
            if raw.empty:
                continue
            # Find which row is the header (look for a row containing both a part-number
            # alias AND a description alias within the first _HEADER_ROW_SCAN_DEPTH rows).
            hdr_idx = None
            for hdr in range(min(_HEADER_ROW_SCAN_DEPTH, len(raw))):
                trial = raw.iloc[hdr].tolist()
                names = [str(v).strip().lower() for v in trial if str(v).lower() not in ("nan", "none", "")]
                has_pn   = any(alias in names for alias in MASTER_COLUMN_ALIASES["part_number"])
                has_desc = any(alias in names for alias in MASTER_COLUMN_ALIASES["description"])
                if has_pn and has_desc:
                    hdr_idx = hdr
                    break
            if hdr_idx is None:
                continue

            df = _clean(xf.parse(sheet, header=hdr_idx))
            desc_col = _find_column(df, MASTER_COLUMN_ALIASES["description"])
            mfr_col  = _find_column(df, MASTER_COLUMN_ALIASES["manufacturer"])
            if not desc_col:
                continue

            # Try every potential PN column in alias order; use the first one whose
            # normalized values actually overlap with the master items' PNs.
            # This handles sheets where "SKU" = internal IDs but "Model" = catalog PN.
            pn_col = None
            cols_lower = {c.lower().strip(): c for c in df.columns}
            for alias in MASTER_COLUMN_ALIASES["part_number"]:
                cand = cols_lower.get(alias)
                if cand is None:
                    continue
                sample_norms = {
                    normalize_part_number(str(v).strip())
                    for v in df[cand].dropna().astype(str).head(50)
                    if str(v).strip().lower() not in ("nan", "none", "")
                }
                if sample_norms & master_norms:
                    pn_col = cand
                    break
            # Fuzzy fallback — verify overlap before accepting
            if pn_col is None:
                cand = _find_column(df, MASTER_COLUMN_ALIASES["part_number"])
                if cand:
                    sample_norms = {
                        normalize_part_number(str(v).strip())
                        for v in df[cand].dropna().astype(str).head(50)
                        if str(v).strip().lower() not in ("nan", "none", "")
                    }
                    if sample_norms & master_norms:
                        pn_col = cand
            if not pn_col:
                continue

            for _, row in df.iterrows():
                pn   = normalize_part_number(str(row.get(pn_col, "")).strip())
                desc = normalize_description(str(row.get(desc_col, "")).strip())
                mfr  = str(row.get(mfr_col, "")).strip() if mfr_col else ""
                if pn and desc and pn not in desc_lookup:
                    desc_lookup[pn] = desc
                if pn and mfr and pn not in mfr_lookup:
                    mfr_lookup[pn] = mfr

        except Exception as e:
            logger.debug("Enrichment sheet '%s' skipped: %s", sheet, e)
            continue

    if not desc_lookup:
        return

    filled = 0
    for item in items:
        key = item["part_number_normalized"]
        if not (item.get("description") or "").strip() and key in desc_lookup:
            item["description"] = desc_lookup[key]
            filled += 1
        if not (item.get("manufacturer") or "").strip() and key in mfr_lookup:
            item["manufacturer"] = mfr_lookup[key]

    if filled > 0:
        logger.info(
            "[file_parser] enriched %d/%d descriptions from %d-sheet workbook",
            filled, len(items), len(list(_visible_sheet_names(xf))),
        )


# ── value coercers ────────────────────────────────────────────────────────────

def _safe_float(val) -> float | None:
    try:
        cleaned = str(val).replace("$", "").replace(",", "").replace("£", "").replace("€", "").strip()
        f = float(cleaned)
        return f if f >= 0 else None
    except (ValueError, TypeError):
        return None


def _safe_int(val, default: int = 1) -> int:
    try:
        v = str(val).strip()
        if not v or v.lower() in ("nan", "none", ""):
            return default
        return max(0, int(float(v)))  # preserve explicit 0; only default to 1 on missing
    except (ValueError, TypeError):
        return default
