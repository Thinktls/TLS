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
    ],
    "description": [
        "description", "desc", "item description", "product name", "name",
        "product description", "item name", "product", "item",
        "model title", "model name", "item title", "title",
        "part description", "part name", "product title",
        "specification", "spec", "specs", "specifications",
        "details", "info", "information", "notes",
        "long description", "short description", "product details",
        "line description", "line item", "line item description",
        "commodity description",
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
        "grading description", "grading notes", "grade description",
        "quality", "quality grade", "cosmetic grade",
        "r2v3", "r2 grade", "cosmetic",
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
    # Grade/condition — used when buyer submits a unit-level file (laptops, servers)
    # so we aggregate by (model, grade) and match master items exactly.
    "category": [
        "grade", "final grade", "condition", "condition grade",
        "grading description", "grading notes", "grade description",
        "quality", "quality grade", "cosmetic", "cosmetic grade",
        "r2v3", "r2 grade",
    ],
}

FUZZY_THRESHOLD = 72   # minimum rapidfuzz score for a column name to match

# How many leading rows to try as the header row.
# This is NOT a data row limit — all rows are always parsed regardless of file size.
# 15 covers files that have a title block, logo row, instruction rows, or blank rows
# before the actual column headers begin.
_HEADER_ROW_SCAN_DEPTH = 15

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

    rows = []
    for idx, row in df.iterrows():
        raw_pn = str(row.get(mapping["part_number"], "")).strip()
        if not raw_pn or raw_pn.lower() in ("nan", "none", "") or _is_junk_row(raw_pn):
            continue
        rows.append({
            "part_number": raw_pn,
            "part_number_normalized": normalize_part_number(raw_pn),
            "description": normalize_description(str(row.get(mapping.get("description", ""), ""))),
            "manufacturer": str(row.get(mapping.get("manufacturer", ""), "")).strip(),
            "quantity": _safe_int(row.get(mapping.get("quantity", ""), 1)),
            "reserve_price": _safe_float(row.get(mapping.get("reserve_price", ""), None)),
            "category": str(row.get(mapping.get("category", ""), "")).strip(),
            "row_number": int(idx) + 2,
        })

    # Consolidate duplicate normalized part numbers: sum quantities, keep lowest reserve price
    consolidated: dict[str, dict] = {}
    for row in rows:
        key = row["part_number_normalized"]
        if key in consolidated:
            existing = consolidated[key]
            existing["quantity"] = (existing["quantity"] or 0) + (row["quantity"] or 0)
            if row["reserve_price"] is not None:
                if existing["reserve_price"] is None or row["reserve_price"] < existing["reserve_price"]:
                    existing["reserve_price"] = row["reserve_price"]
        else:
            consolidated[key] = row.copy()

    return list(consolidated.values())


def _is_unit_level(df: pd.DataFrame) -> bool:
    """Return True if the DataFrame has a serial/UID column (one row per physical unit)."""
    return _find_column(df, _SERIAL_ALIASES) is not None


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

    rows = []
    for row_idx, (_, row) in enumerate(df.iterrows(), start=1):
        if pn_col:
            pn_val = str(row.get(pn_col, "")).strip()
            if not pn_val or pn_val.lower() in ("nan", "none", "") or _is_junk_row(pn_val):
                continue
            label = pn_val
        else:
            label = normalize_description(str(row.get(desc_col, "")).strip())
            if not label or label.lower() in ("nan", "none", "") or _is_junk_row(label):
                continue

        desc_val = normalize_description(str(row.get(desc_col, "")).strip()) if desc_col else label

        grade = str(row.get(grade_col, "")).strip() if grade_col else ""
        if grade.lower() in ("nan", "none", ""):
            grade = ""

        unit_id = next(
            (v for c in id_cols if (v := str(row.get(c, "")).strip()) and v.lower() not in ("nan", "none")),
            None,
        )

        pn_raw = f"{label}-{grade}" if grade else label
        if unit_id:
            pn_raw = f"{pn_raw}-{unit_id}"

        rows.append({
            "part_number": pn_raw,
            "part_number_normalized": normalize_part_number(pn_raw),
            "description": desc_val,
            "manufacturer": str(row.get(mfr_col, "")).strip() if mfr_col else "",
            "quantity": 1,
            "reserve_price": _safe_float(row.get(reserve_col)) if reserve_col else None,
            "category": grade,
            "row_number": row_idx,
        })

    logger.info("[file_parser] unit-level file: %d rows → %d master items (1:1, no aggregation)", len(df), len(rows))
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
        raise ValueError(
            "Could not find a price column. "
            "Expected headers like: 'Unit Price', 'Price', 'Bid Price', 'Offer', 'Cost'."
        )

    # Unit-level buyer files (ThinkTLS laptops, servers, desktops): one row per physical unit.
    # Group by (model, grade) — same synthesis as admin upload — so bid lines match master items.
    if _is_unit_level(df):
        return _aggregate_buyer_unit_level(df, mapping)

    # Columns not covered by standard mapping — preserved so buyers see all their data
    mapped_cols = set(mapping.values())
    extra_col_names = [c for c in df.columns if c not in mapped_cols]

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

    # Consolidate duplicate part numbers: sum quantities, keep the lowest (most competitive) price
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
        else:
            consolidated[key] = row.copy()

    return list(consolidated.values())


def _aggregate_buyer_unit_level(df: pd.DataFrame, mapping: dict) -> list[dict]:
    """
    For unit-level buyer files (ThinkTLS laptops, servers, desktops) where the buyer fills
    an Offer price for each individual unit row.

    NO grouping or merging — mirrors _aggregate_unit_level on the master-file side exactly,
    one bid line per physical unit, quantity always 1. The part number is built the same way
    (label + grade + serial/UID) so each bid line matches its master item by content, not by
    row order. A buyer who leaves the price blank for a unit simply doesn't bid on it.
    """
    pn_col = mapping["part_number"]
    price_col = mapping["unit_price"]
    desc_col = mapping.get("description")
    grade_col = mapping.get("category")
    id_cols = sorted(_all_identifier_columns(df))

    rows = []
    for row_idx, (_, row) in enumerate(df.iterrows(), start=1):
        label = str(row.get(pn_col, "")).strip()
        if not label or label.lower() in ("nan", "none", "") or _is_junk_row(label):
            continue
        price = _safe_float(row.get(price_col))
        if price is None:
            continue  # buyer left this unit blank — not bidding on it

        grade = str(row.get(grade_col, "") if grade_col else "").strip()
        if grade.lower() in ("nan", "none", ""):
            grade = ""

        unit_id = next(
            (v for c in id_cols if (v := str(row.get(c, "")).strip()) and v.lower() not in ("nan", "none")),
            None,
        )

        pn_raw = f"{label}-{grade}" if grade else label
        if unit_id:
            pn_raw = f"{pn_raw}-{unit_id}"

        desc = normalize_description(str(row.get(desc_col, "") if desc_col else "").strip())
        rows.append({
            "raw_part_number": pn_raw,
            "normalized_part_number": normalize_part_number(pn_raw),
            "description": desc or label,
            "category": grade or None,
            "unit_price": price,
            "quantity": 1,
            "total_price": round(price, 4),
            "row_number": row_idx,
            "extra_columns": None,
        })

    logger.info(
        "[file_parser] buyer unit-level file: %d rows → %d priced bid lines (1:1, no aggregation)",
        len(df), len(rows),
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
        candidates = _candidates_excel(io.BytesIO(file_bytes), ext)
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
            _candidates_excel(io.BytesIO(file_bytes), "xlsx")
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


def _candidates_excel(buf: io.BytesIO, ext: str) -> list[pd.DataFrame]:
    out = []
    try:
        engine = "openpyxl" if ext == "xlsx" else None
        xf = pd.ExcelFile(buf, engine=engine)
        for sheet in _visible_sheet_names(xf):
            bonus = _sheet_score_bonus(sheet)
            for hdr in range(_HEADER_ROW_SCAN_DEPTH):
                try:
                    df = _clean(xf.parse(sheet, header=hdr))
                    if len(df) > 0 and len(df.columns) > 1:
                        df.attrs["_sheet_bonus"] = bonus
                        df.attrs["_sheet_name"] = sheet  # used for deduplication
                        out.append(df)
                except Exception:
                    pass
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
                            df.attrs["_sheet_bonus"] = _sheet_score_bonus(sheet)
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
