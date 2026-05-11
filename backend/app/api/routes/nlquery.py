"""
Natural language query interface powered by Claude API.
Translates plain-English questions to SQL, runs against a read-only DB connection.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_admin
from app.core.config import settings

router = APIRouter(prefix="/query", tags=["nl_query"])

SCHEMA_CONTEXT = """
Tables:
- users(id, email, full_name, role, company_name, fluff_percentage, buyer_score, last_bid_at)
- bid_rounds(id, name, commodity, status, submission_deadline, total_line_items, created_at)
- master_items(id, bid_round_id, part_number, description, manufacturer, quantity, reserve_price, category)
- bid_files(id, bid_round_id, buyer_id, filename, status, lines_parsed, lines_matched, uploaded_at)
- bid_lines(id, bid_round_id, buyer_id, master_item_id, raw_part_number, unit_price, quantity, match_method, match_status, exception_type, is_winner, real_winning_price, fluffed_loss_price, is_anomaly, z_score)
- deals(id, bid_round_id, master_item_id, winning_buyer_id, part_number, quantity, winning_price, total_value, status, razor_push_status)
"""


class NLQueryRequest(BaseModel):
    question: str


@router.post("/")
async def natural_language_query(req: NLQueryRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(503, "AI query requires ANTHROPIC_API_KEY to be configured")

    sql = await _translate_to_sql(req.question)
    if not sql:
        raise HTTPException(400, "Could not interpret your question as a database query")

    # Safety: only allow SELECT
    if not sql.strip().upper().startswith("SELECT"):
        raise HTTPException(400, "Only SELECT queries are permitted")

    try:
        result = db.execute(text(sql))
        columns = list(result.keys())
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"question": req.question, "sql": sql, "columns": columns, "rows": rows, "count": len(rows)}
    except Exception as e:
        raise HTTPException(500, f"Query execution error: {str(e)}")


async def _translate_to_sql(question: str) -> str | None:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": f"""You are a SQL generator for the ThinkTLS Bid Desk platform.

{SCHEMA_CONTEXT}

Convert this question to a PostgreSQL SELECT query. Return ONLY the SQL, no explanation, no markdown.
If the question cannot be answered with these tables, return: NULL

Question: {question}"""
            }]
        )

        sql = message.content[0].text.strip()
        if sql.upper() == "NULL" or not sql:
            return None
        # Strip markdown code fences if model wraps it
        sql = sql.replace("```sql", "").replace("```", "").strip()
        return sql
    except Exception:
        return None
