"""
Natural language query interface.
Translates plain-English questions to SQL, runs against a read-only DB connection.

Supports two backends (in priority order):
  1. Anthropic Claude (set ANTHROPIC_API_KEY)
  2. Ollama / any OpenAI-compatible endpoint (set OLLAMA_BASE_URL + OLLAMA_MODEL)
"""
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_admin
from app.core.config import settings

router = APIRouter(prefix="/query", tags=["nl_query"])

SCHEMA_CONTEXT = """
PostgreSQL tables:

users(id, email, full_name, role, is_active, company_name, fluff_percentage, fluff_enabled,
  buyer_score, last_bid_at, last_win_date, win_rate, total_lines_won, total_lines_bid,
  total_margin_contribution, total_rounds_participated, created_at)
  role: 'admin' | 'buyer'

bid_rounds(id, name, commodity, status, customer, submission_deadline, total_line_items,
  reserve_price_enabled, created_at, updated_at)
  status: 'draft' | 'open' | 'closed' | 'processing' | 'complete'
  commodity: 'laptops' | 'desktops' | 'servers' | 'networking' | 'storage'

master_items(id, bid_round_id, part_number, description, manufacturer, quantity,
  reserve_price, category, created_at)

bid_files(id, bid_round_id, buyer_id, filename, status, lines_parsed, lines_matched,
  lines_exception, uploaded_at, processed_at)
  status: 'pending' | 'processing' | 'processed' | 'error'

bid_lines(id, bid_file_id, bid_round_id, buyer_id, master_item_id, raw_part_number,
  unit_price, quantity, match_method, match_status, exception_type, is_winner,
  real_winning_price, fluffed_loss_price, is_anomaly, z_score, created_at)
  match_status: 'matched' | 'exception' | 'unmatched'
  match_method: 'exact' | 'fuzzy' | 'ai'

deals(id, bid_round_id, master_item_id, winning_buyer_id, part_number, description,
  quantity, winning_price, total_value, status, approved_by, approved_at,
  razor_push_status, razor_pushed_at, created_at)
  status: 'pending_approval' | 'approved' | 'rejected' | 'pushed_to_razor'
  NOTE: deals has no commodity column — join bid_rounds via bid_round_id to get commodity

Key foreign keys:
  deals.winning_buyer_id → users.id
  deals.bid_round_id → bid_rounds.id
  bid_lines.buyer_id → users.id
  bid_lines.bid_round_id → bid_rounds.id
"""

SQL_SYSTEM_PROMPT = f"""{SCHEMA_CONTEXT}

Rules:
- Return ONLY valid PostgreSQL SELECT SQL. No explanation. No markdown.
- If unanswerable with these tables, return: NULL
- Use JOINs, not subqueries with ANY(ARRAY(...))
- For ROUND with precision: ROUND((expr)::numeric, 2)  [PostgreSQL requires numeric type]
- Use NULLIF(denominator, 0) to avoid division by zero
- Always use table aliases when joining"""


class NLQueryRequest(BaseModel):
    question: str


def _ai_available() -> bool:
    return bool(settings.ANTHROPIC_API_KEY or settings.OLLAMA_BASE_URL)


def _fix_sql(sql: str) -> str:
    """Post-process AI-generated SQL to fix common PostgreSQL quirks."""
    return _fix_round_casts(sql)


def _fix_round_casts(sql: str) -> str:
    """Fix ROUND(expr, N) → ROUND((expr)::numeric, N).
    PostgreSQL ROUND(double precision, int) is not supported — requires numeric.
    Uses a paren-aware parser to handle expressions with nested function calls.
    """
    result = []
    i = 0
    upper = sql.upper()
    while i < len(sql):
        if upper[i:i+6] == 'ROUND(' and (i == 0 or not sql[i-1].isalpha()):
            result.append('ROUND(')
            i += 6
            # Find content between ROUND( ... )
            depth = 1
            start = i
            while i < len(sql) and depth > 0:
                if sql[i] == '(':
                    depth += 1
                elif sql[i] == ')':
                    depth -= 1
                i += 1
            inner = sql[start:i - 1]
            # Find the last top-level comma (separates expr from precision)
            comma_pos = None
            d = 0
            for j, c in enumerate(inner):
                if c == '(':
                    d += 1
                elif c == ')':
                    d -= 1
                elif c == ',' and d == 0:
                    comma_pos = j
            if comma_pos is not None:
                expr = inner[:comma_pos].strip()
                precision = inner[comma_pos + 1:].strip()
                if '::numeric' not in expr and '::decimal' not in expr:
                    expr = f'({expr})::numeric'
                result.append(f'{expr}, {precision})')
            else:
                result.append(inner + ')')
        else:
            result.append(sql[i])
            i += 1
    return ''.join(result)


@router.post("/")
async def natural_language_query(req: NLQueryRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    if not _ai_available():
        raise HTTPException(503, "AI query requires ANTHROPIC_API_KEY or OLLAMA_BASE_URL to be configured")

    sql = await _translate_to_sql(req.question)
    if not sql:
        raise HTTPException(400, "Could not interpret your question as a database query")

    sql_clean = _fix_sql(sql.strip().rstrip(";").strip())

    if not sql_clean.upper().startswith("SELECT"):
        raise HTTPException(400, "Only SELECT queries are permitted. The AI could not translate this question into a SELECT statement.")

    last_error = None
    for attempt in range(2):
        try:
            result = db.execute(text(sql_clean))
            columns = list(result.keys())
            rows = [dict(zip(columns, row)) for row in result.fetchmany(200)]
            return {
                "question": req.question,
                "sql": sql_clean,
                "columns": columns,
                "rows": rows,
                "count": len(rows),
                "truncated": len(rows) == 200,
            }
        except Exception as e:
            db.rollback()
            last_error = e
            if attempt == 0:
                error_hint = str(e).split("\n")[0]
                fixed = await _translate_to_sql(
                    f"{req.question}\n\nPrevious SQL failed: {sql_clean}\nError: {error_hint}\nFix the SQL."
                )
                if fixed:
                    sql_clean = _fix_sql(fixed.strip().rstrip(";").strip())
                    if sql_clean.upper().startswith("SELECT"):
                        continue
            break

    raise HTTPException(500, f"SQL execution error: {str(last_error)}\n\nGenerated SQL:\n{sql_clean}")


async def _translate_to_sql(question: str) -> str | None:
    if settings.ANTHROPIC_API_KEY:
        return await _translate_anthropic(question)
    if settings.OLLAMA_BASE_URL:
        return await _translate_ollama(question)
    return None


async def _translate_anthropic(question: str) -> str | None:
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": f"{SQL_SYSTEM_PROMPT}\n\nQuestion: {question}",
            }],
        )
        sql = message.content[0].text.strip()
        if sql.upper() == "NULL" or not sql:
            return None
        return sql.replace("```sql", "").replace("```", "").strip()
    except Exception:
        return None


async def _translate_ollama(question: str) -> str | None:
    try:
        import httpx

        base = settings.OLLAMA_BASE_URL.rstrip("/")
        if base.endswith("/v1"):
            endpoint = f"{base}/chat/completions"
        elif "/openai" in base:
            endpoint = f"{base}/v1/chat/completions"
        else:
            endpoint = f"{base}/v1/chat/completions"

        payload = {
            "model": settings.OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": SQL_SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}"},
            ],
            "stream": False,
            "temperature": 0,
        }

        headers = {"Content-Type": "application/json"}
        if settings.OLLAMA_API_KEY:
            headers["Authorization"] = f"Bearer {settings.OLLAMA_API_KEY}"

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(endpoint, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        sql = data["choices"][0]["message"]["content"].strip()
        if sql.upper() == "NULL" or not sql:
            return None
        return sql.replace("```sql", "").replace("```", "").strip()
    except Exception:
        return None
