"""
AI-powered file parser — uses the same AI backend as nlquery.py.
Priority: ANTHROPIC_API_KEY → OLLAMA_BASE_URL (OpenRouter / Groq / Ollama).
Falls back when standard column detection fails, handling any file format.
"""
import json
import logging
import httpx

logger = logging.getLogger(__name__)


def _ai_available() -> bool:
    from app.core.config import settings
    return bool(settings.ANTHROPIC_API_KEY or settings.OLLAMA_BASE_URL)


def _call_anthropic(prompt: str) -> str:
    from app.core.config import settings
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",  # fast + cheap for structured extraction
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


def _call_ollama(prompt: str) -> str:
    from app.core.config import settings
    base = settings.OLLAMA_BASE_URL.rstrip("/")
    endpoint = f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if settings.OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {settings.OLLAMA_API_KEY}"
    resp = httpx.post(
        endpoint,
        headers=headers,
        json={
            "model": settings.OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def ai_parse_buyer_file(file_bytes: bytes, filename: str) -> list[dict]:
    """
    Load the file, ask the configured AI to identify columns, then parse into bid rows.
    Returns same shape as parse_buyer_file().
    Raises ValueError on unrecoverable failure.
    """
    from app.core.config import settings
    from app.services.file_parser import (
        _load_dataframe, BUYER_COLUMN_ALIASES,
        _safe_float, _safe_int,
    )
    from app.services.normalizer import normalize_part_number, normalize_description

    if not _ai_available():
        raise ValueError(
            "Could not auto-detect columns and no AI backend is configured. "
            "Please download the Bid File template and submit that."
        )

    try:
        df = _load_dataframe(file_bytes, filename, BUYER_COLUMN_ALIASES)
    except Exception as e:
        raise ValueError(f"Cannot read file '{filename}': {e}")

    columns = list(df.columns)
    sample_csv = df.head(8).to_csv(index=False)

    prompt = (
        "You are a file-parsing assistant for an IT hardware procurement platform. "
        "A buyer has uploaded a bid file. Identify which column serves each role.\n\n"
        f"Columns: {columns}\n\n"
        f"Sample rows (first 8):\n{sample_csv}\n\n"
        "Return JSON only — no explanation, no markdown fences:\n"
        '{"part_number_col": "exact column name or null", '
        '"unit_price_col": "exact column name or null", '
        '"description_col": "exact column name or null", '
        '"quantity_col": "exact column name or null"}\n\n'
        "Rules:\n"
        "- part_number_col: item identifier — Part#, SKU, Model, MPN, Model Number, "
        "  P/N, Item#, Catalog#, Reference, Asset# — pick the most specific identifier (REQUIRED)\n"
        "- unit_price_col: buyer's offered price per unit — Offer, Bid, Quote, Price, "
        "  Unit Price, Cost, Each, EA — return null if all values are blank/zero\n"
        "- description_col: human-readable product name or description\n"
        "- quantity_col: number of units — Qty, Quantity, Units, Count, Pieces\n"
        "Note: the file may come from any company with any layout. "
        "Focus on semantics, not column position."
    )

    try:
        if settings.ANTHROPIC_API_KEY:
            raw = _call_anthropic(prompt)
        else:
            raw = _call_ollama(prompt)
        # Strip markdown fences if present
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        mapping = json.loads(raw)
    except Exception as exc:
        logger.warning("AI file parsing failed: %s", exc)
        raise ValueError(
            "AI could not identify columns. "
            "Please download the Bid File template and fill in the Unit Price column."
        )

    pn_col    = mapping.get("part_number_col")
    price_col = mapping.get("unit_price_col")
    desc_col  = mapping.get("description_col")
    qty_col   = mapping.get("quantity_col")

    def _valid(col):
        return col and col in df.columns

    if not _valid(pn_col):
        raise ValueError(
            "AI could not find a part number / item identifier column. "
            "Please download the Bid File template and submit that."
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
            "raw_part_number":        raw_pn,
            "normalized_part_number": normalize_part_number(raw_pn),
            "description":            desc,
            "unit_price":             unit_price,
            "quantity":               qty,
            "total_price":            round(unit_price * qty, 4) if unit_price else None,
            "row_number":             int(idx) + 2,
        })

    if not rows:
        raise ValueError("AI parsed the file but found no valid data rows.")

    return rows
