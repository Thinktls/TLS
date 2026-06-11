"""
Parse master files and buyer bid files.
Supports: .xlsx, .xls, .csv, .pdf, .docx, .doc

Auto-decodes column names via alias matching + rapidfuzz fuzzy fallback.
Tries every sheet (Excel) and every header row (all formats) so files
that don't match the standard template still parse correctly.
"""
import io
import logging
import pandas as pd
from rapidfuzz import fuzz
from app.services.normalizer import normalize_part_number, normalize_description

logger = logging.getLogger(__name__)

MASTER_COLUMN_ALIASES = {
    "part_number": [
        "part number", "part#", "part no", "partno", "part_number",
        "sku", "item number", "item#", "part", "model number", "model#",
        "p/n", "pn", "mfr part#", "mfr part number",
        # ThinkTLS drive format
        "drive part#", "drive part number",
    ],
    "description": [
        "description", "desc", "item description", "product name", "name",
        "product description", "item name", "product",
        # ThinkTLS laptop/inventory formats
        "model title", "model name", "item title", "title",
    ],
    "manufacturer": ["manufacturer", "mfr", "brand", "vendor", "make", "oem"],
    "quantity": [
        "quantity", "qty", "units", "count", "unit count",
        "total qty", "total quantity",
    ],
    "reserve_price": [
        "reserve price", "reserve", "floor price", "minimum price",
        "min price", "floor", "reserve_price",
    ],
    "category": [
        "category", "cat", "type", "commodity", "product type",
        # ThinkTLS graded inventory
        "grade", "final grade", "condition", "condition grade",
    ],
}

BUYER_COLUMN_ALIASES = {
    "part_number": [
        "part number", "part#", "part no", "partno", "part_number",
        "sku", "mfr part#", "part", "model number", "model#",
        "p/n", "pn", "item number", "item#",
        # ThinkTLS drive format
        "drive part#", "drive part number",
    ],
    "description": [
        "description", "desc", "item description", "product",
        "product description", "item name", "name",
        # ThinkTLS laptop/inventory formats
        "model title", "model name", "item title", "title",
    ],
    "unit_price": [
        "unit price", "price", "unit cost", "cost", "your price",
        "bid price", "unit_price", "offer", "offer price", "your bid",
        "bid", "quote", "quoted price",
    ],
    "quantity": ["quantity", "qty", "units", "unit count"],
}

FUZZY_THRESHOLD = 72   # minimum rapidfuzz score for a column name to match
MAX_HEADER_SCAN = 6    # try up to this many rows as the header row

# Columns that signal a unit-level (one-row-per-unit) inventory file
_SERIAL_ALIASES = ["serial", "serial number", "serial#", "serialno", "uid", "asset id", "asset#", "barcode"]


# ── public API ────────────────────────────────────────────────────────────────

def parse_master_file(file_bytes: bytes, filename: str) -> list[dict]:
    df = _load_dataframe(file_bytes, filename, MASTER_COLUMN_ALIASES)
    mapping = _map_columns(df, MASTER_COLUMN_ALIASES)

    # Unit-level laptop/inventory files: group by (model, grade) → synthesise master items
    if _is_unit_level(df) and "description" in mapping:
        return _aggregate_unit_level(df, mapping)

    if "part_number" not in mapping:
        raise ValueError(
            "Could not find a part number column. "
            "Expected headers like: 'Part Number', 'SKU', 'Part#', 'P/N', 'Model Number'."
        )

    rows = []
    for idx, row in df.iterrows():
        raw_pn = str(row.get(mapping["part_number"], "")).strip()
        if not raw_pn or raw_pn.lower() in ("nan", "none", ""):
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
    return rows


def _is_unit_level(df: pd.DataFrame) -> bool:
    """Return True if the DataFrame has a serial/UID column (one row per physical unit)."""
    return _find_column(df, _SERIAL_ALIASES) is not None


def _aggregate_unit_level(df: pd.DataFrame, mapping: dict) -> list[dict]:
    """
    Group a unit-level inventory file by (model_title, grade) and return one
    master-item row per group with quantity = count of units.
    """
    desc_col = mapping["description"]
    grade_col = mapping.get("category")  # "grade" / "final grade" maps to category
    mfr_col = mapping.get("manufacturer")
    reserve_col = mapping.get("reserve_price")

    groups: dict[tuple, dict] = {}
    for _, row in df.iterrows():
        model = normalize_description(str(row.get(desc_col, "")).strip())
        if not model or model.lower() in ("nan", "none", ""):
            continue
        grade = str(row.get(grade_col, "")).strip() if grade_col else ""
        if grade.lower() in ("nan", "none", ""):
            grade = ""
        key = (model, grade)
        if key not in groups:
            groups[key] = {
                "description": model,
                "grade": grade,
                "manufacturer": str(row.get(mfr_col, "")).strip() if mfr_col else "",
                "reserve_price": _safe_float(row.get(reserve_col)) if reserve_col else None,
                "count": 0,
            }
        groups[key]["count"] += 1

    rows = []
    for (model, grade), g in groups.items():
        # Synthesise a part number from model + grade so each group is uniquely addressable
        pn_raw = f"{model}-{grade}" if grade else model
        pn_norm = normalize_part_number(pn_raw)
        rows.append({
            "part_number": pn_raw,
            "part_number_normalized": pn_norm,
            "description": g["description"],
            "manufacturer": g["manufacturer"],
            "quantity": g["count"],
            "reserve_price": g["reserve_price"],
            "category": g["grade"],
            "row_number": 1,
        })

    logger.info("[file_parser] unit-level aggregation: %d units → %d master items", sum(g["count"] for g in groups.values()), len(rows))
    return rows


def parse_buyer_file(file_bytes: bytes, filename: str) -> list[dict]:
    df = _load_dataframe(file_bytes, filename, BUYER_COLUMN_ALIASES)
    mapping = _map_columns(df, BUYER_COLUMN_ALIASES)

    if "part_number" not in mapping:
        raise ValueError(
            "Could not find a part number column. "
            "Expected headers like: 'Part Number', 'SKU', 'Part#', 'P/N'."
        )
    if "unit_price" not in mapping:
        raise ValueError(
            "Could not find a price column. "
            "Expected headers like: 'Unit Price', 'Price', 'Bid Price', 'Offer', 'Cost'."
        )

    rows = []
    for idx, row in df.iterrows():
        raw_pn = str(row.get(mapping["part_number"], "")).strip()
        if not raw_pn or raw_pn.lower() in ("nan", "none", ""):
            continue
        unit_price = _safe_float(row.get(mapping["unit_price"]))
        qty = _safe_int(row.get(mapping.get("quantity", ""), 1))
        rows.append({
            "raw_part_number": raw_pn,
            "normalized_part_number": normalize_part_number(raw_pn),
            "description": normalize_description(str(row.get(mapping.get("description", ""), ""))),
            "unit_price": unit_price,
            "quantity": qty,
            "total_price": round(unit_price * qty, 4) if unit_price else None,
            "row_number": int(idx) + 2,
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

    # Return the candidate with the highest column-match score
    return max(candidates, key=lambda df: _score_df(df, hint_aliases))


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df.dropna(how="all")


def _candidates_excel(buf: io.BytesIO, ext: str) -> list[pd.DataFrame]:
    out = []
    try:
        engine = "openpyxl" if ext == "xlsx" else None
        xf = pd.ExcelFile(buf, engine=engine)
        for sheet in xf.sheet_names:
            for hdr in range(MAX_HEADER_SCAN):
                try:
                    df = _clean(xf.parse(sheet, header=hdr))
                    if len(df) > 0 and len(df.columns) > 1:
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
        for sheet in xf.sheet_names:
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

            for block_cols in slices:
                if len(block_cols) < 2:
                    continue
                block = raw[block_cols].copy()
                for hdr in range(min(MAX_HEADER_SCAN, len(block))):
                    try:
                        header_row = block.iloc[hdr].tolist()
                        data = block.iloc[hdr + 1:].copy()
                        data.columns = [str(h).strip() if str(h).lower() not in ("nan", "none") else f"col_{i}"
                                         for i, h in enumerate(header_row)]
                        df = _clean(data.reset_index(drop=True))
                        if len(df) > 0 and len(df.columns) > 1 and _score_df(df, hint_aliases) > 0:
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
        for hdr in range(MAX_HEADER_SCAN):
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
