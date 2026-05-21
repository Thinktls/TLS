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
    ],
    "description": [
        "description", "desc", "item description", "product name", "name",
        "product description", "item name", "product",
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
    "category": ["category", "cat", "type", "commodity", "product type"],
}

BUYER_COLUMN_ALIASES = {
    "part_number": [
        "part number", "part#", "part no", "partno", "part_number",
        "sku", "mfr part#", "part", "model number", "model#",
        "p/n", "pn", "item number", "item#",
    ],
    "description": [
        "description", "desc", "item description", "product",
        "product description", "item name", "name",
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


# ── public API ────────────────────────────────────────────────────────────────

def parse_master_file(file_bytes: bytes, filename: str) -> list[dict]:
    df = _load_dataframe(file_bytes, filename, MASTER_COLUMN_ALIASES)
    mapping = _map_columns(df, MASTER_COLUMN_ALIASES)

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
        return max(1, int(float(str(val))))
    except (ValueError, TypeError):
        return default
