"""
AI-powered file parser using OpenRouter (OpenAI-compatible).
Falls back when standard column detection fails — handles any file format
by asking an LLM to identify which columns map to part_number, unit_price,
description, and quantity.
"""
import json
import logging
import httpx

logger = logging.getLogger(__name__)


def ai_parse_buyer_file(
    file_bytes: bytes,
    filename: str,
    api_key: str,
    model: str,
) -> list[dict]:
    """
    Load the file, ask OpenRouter to identify columns, then parse into bid rows.
    Returns same shape as parse_buyer_file().
    Raises ValueError on unrecoverable failure.
    """
    from app.services.file_parser import (
        _load_dataframe, BUYER_COLUMN_ALIASES,
        _safe_float, _safe_int,
    )
    from app.services.normalizer import normalize_part_number, normalize_description

    # Load best-candidate dataframe (tries all sheets / header rows)
    try:
        df = _load_dataframe(file_bytes, filename, BUYER_COLUMN_ALIASES)
    except Exception as e:
        raise ValueError(f"Cannot read file '{filename}': {e}")

    columns = list(df.columns)
    sample_csv = df.head(8).to_csv(index=False)

    prompt = (
        "You are a file-parsing assistant. Analyse this spreadsheet excerpt "
        "and identify the best column for each field.\n\n"
        f"Columns: {columns}\n\n"
        f"Sample rows (first 8):\n{sample_csv}\n\n"
        "Return JSON only — no explanation, no markdown:\n"
        '{"part_number_col": "exact column name or null", '
        '"unit_price_col": "exact column name or null", '
        '"description_col": "exact column name or null", '
        '"quantity_col": "exact column name or null"}\n\n'
        "Rules:\n"
        "- part_number_col: item identifier, SKU, model #, part #, serial (REQUIRED)\n"
        "- unit_price_col: price per unit; may be blank/empty in file — return null if absent\n"
        "- description_col: product description or model name\n"
        "- quantity_col: qty / units / count"
    )

    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://thinktls.com",
                "X-Title": "ThinkTLS Bid Desk",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]
        mapping = json.loads(raw)
    except Exception as exc:
        logger.warning("OpenRouter AI parsing failed: %s", exc)
        raise ValueError(
            "AI file parsing could not identify columns. "
            "Please use the Bid Download File template and fill in the Unit Price column."
        )

    pn_col   = mapping.get("part_number_col")
    price_col = mapping.get("unit_price_col")
    desc_col  = mapping.get("description_col")
    qty_col   = mapping.get("quantity_col")

    # Validate column names exist in the actual dataframe
    def _valid(col):
        return col and col in df.columns

    if not _valid(pn_col):
        raise ValueError(
            "AI could not find a part number / item identifier column. "
            "Please download the Bid Download File template and submit that."
        )

    rows: list[dict] = []
    for idx, row in df.iterrows():
        raw_pn = str(row.get(pn_col, "")).strip()
        if not raw_pn or raw_pn.lower() in ("nan", "none", ""):
            continue
        unit_price = _safe_float(row.get(price_col)) if _valid(price_col) else None
        qty        = _safe_int(row.get(qty_col) if _valid(qty_col) else 1)
        desc       = normalize_description(str(row.get(desc_col, "")).strip()) if _valid(desc_col) else ""
        rows.append({
            "raw_part_number":       raw_pn,
            "normalized_part_number": normalize_part_number(raw_pn),
            "description":           desc,
            "unit_price":            unit_price,
            "quantity":              qty,
            "total_price":           round(unit_price * qty, 4) if unit_price else None,
            "row_number":            int(idx) + 2,
        })

    if not rows:
        raise ValueError("AI parsed the file but found no valid data rows.")

    return rows
