"""
Parse master files and buyer bid files.
Supports: .xlsx, .xls, .csv
Returns a list of dicts with normalized fields.
"""
import io
import pandas as pd
from app.services.normalizer import normalize_part_number, normalize_description


MASTER_COLUMN_ALIASES = {
    "part_number": ["part number", "part#", "part no", "partno", "part_number", "sku", "item number", "item#"],
    "description": ["description", "desc", "item description", "product name", "name"],
    "manufacturer": ["manufacturer", "mfr", "brand", "vendor"],
    "quantity": ["quantity", "qty", "units", "count"],
    "reserve_price": ["reserve price", "reserve", "floor price", "minimum price", "min price"],
    "category": ["category", "cat", "type", "commodity"],
}

BUYER_COLUMN_ALIASES = {
    "part_number": ["part number", "part#", "part no", "partno", "part_number", "sku", "mfr part#"],
    "description": ["description", "desc", "item description", "product"],
    "unit_price": ["unit price", "price", "unit cost", "cost", "your price", "bid price"],
    "quantity": ["quantity", "qty", "units"],
}


def _find_column(df: pd.DataFrame, aliases: list[str]) -> str | None:
    cols_lower = {c.lower().strip(): c for c in df.columns}
    for alias in aliases:
        if alias in cols_lower:
            return cols_lower[alias]
    return None


def _map_columns(df: pd.DataFrame, alias_map: dict) -> dict:
    mapping = {}
    for field, aliases in alias_map.items():
        col = _find_column(df, aliases)
        if col:
            mapping[field] = col
    return mapping


def parse_master_file(file_bytes: bytes, filename: str) -> list[dict]:
    df = _load_dataframe(file_bytes, filename)
    mapping = _map_columns(df, MASTER_COLUMN_ALIASES)

    if "part_number" not in mapping:
        raise ValueError("Could not find a part number column in the master file. Expected: 'Part Number', 'SKU', 'Part#', etc.")

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
            "row_number": int(idx) + 2,  # +2 for header + 0-index
        })
    return rows


def parse_buyer_file(file_bytes: bytes, filename: str) -> list[dict]:
    df = _load_dataframe(file_bytes, filename)
    mapping = _map_columns(df, BUYER_COLUMN_ALIASES)

    if "part_number" not in mapping:
        raise ValueError("Could not find a part number column. Expected: 'Part Number', 'SKU', 'Part#', etc.")
    if "unit_price" not in mapping:
        raise ValueError("Could not find a price column. Expected: 'Unit Price', 'Price', 'Bid Price', etc.")

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


def _load_dataframe(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = filename.rsplit(".", 1)[-1].lower()
    buf = io.BytesIO(file_bytes)
    if ext in ("xlsx", "xls"):
        df = pd.read_excel(buf, engine="openpyxl" if ext == "xlsx" else None)
    elif ext == "csv":
        df = pd.read_csv(buf)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use .xlsx, .xls, or .csv")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _safe_float(val) -> float | None:
    try:
        f = float(str(val).replace("$", "").replace(",", "").strip())
        return f if f >= 0 else None
    except (ValueError, TypeError):
        return None


def _safe_int(val, default: int = 1) -> int:
    try:
        return max(1, int(float(str(val))))
    except (ValueError, TypeError):
        return default
