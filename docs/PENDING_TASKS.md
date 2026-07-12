# PENDING TASKS
## ThinkTLS Bid Desk — What Still Needs Work

Last updated: 2026-05-17

---

## Priority 1 — Production Blockers

### P1-1: Change Default SECRET_KEY [NEEDS FIX]
- **File**: `backend/app/core/config.py` line 7
- **Issue**: `SECRET_KEY: str = "change-me-in-production"` — if .env is missing this key, all JWTs are signed with a public default
- **Fix**: Generate and set a real secret: `python -c "import secrets; print(secrets.token_hex(32))"`
- **Impact**: Security risk in production

### P1-2: Set API Keys in .env [INCOMPLETE]
All keys have working code but are missing values:
```
ANTHROPIC_API_KEY=       # enables AI matching + NL Query
SENDGRID_API_KEY=        # enables all email flows
RAZOR_API_URL=           # enables ERP deal push
RAZOR_API_KEY=           # Razor bearer token
```

### P1-3: SENDGRID_WEBHOOK_KEY Should Use Settings [NEEDS FIX]
- **File**: `backend/app/api/routes/inbound_email.py`
- **Issue**: `os.getenv("SENDGRID_WEBHOOK_KEY")` bypasses pydantic-settings; .env value ignored
- **Fix**: Add `SENDGRID_WEBHOOK_KEY: str = ""` to Settings class in config.py, import settings, use `settings.SENDGRID_WEBHOOK_KEY`

---

## Priority 2 — Minor Code Quality

### P2-1: Remove Dead Code in submit_bid [NEEDS FIX]
- **File**: `backend/app/api/routes/buyer.py` — `submit_bid` function
- **Issue**: `master_items = db.query(MasterItem)...` and `master_index = {...}` are built but never used
- **Fix**: Delete those two lines

### P2-2: Fix last_win_date Logic [NEEDS FIX]
- **File**: `backend/app/services/buyer_scorer.py` line 98-99
- **Issue**: Uses `line.created_at` (bid submitted time) as `last_win_date`. Should be deal `approved_at`
- **Fix**: Join to deals table and use `deal.approved_at` for winner lines

### P2-3: N+3 Queries in my_rounds [NEEDS FIX]
- **File**: `backend/app/api/routes/buyer.py` — `my_rounds` function
- **Issue**: For each round, does 1 round query + 1 line count query + 1 won count query = N×3 queries
- **Fix**: Use a single aggregation query with GROUP BY

### P2-4: AI Matcher Only Searches 20 Master Items [PARTIALLY WORKING]
- **File**: `backend/app/services/matcher.py` line 99 and `ai_matcher.py`
- **Issue**: `candidates = master_items[:20]` — rounds with >20 master items get incomplete AI search
- **Fix**: For large catalogs, pre-filter candidates using fuzzy top-K before sending to Claude

### P2-5: Razor Retry Blocks Thread [NEEDS FIX]
- **File**: `backend/app/services/razor_client.py` line 89
- **Issue**: `time.sleep(BACKOFF_BASE ** attempt)` — blocks the uvicorn worker thread for up to 6 seconds
- **Fix**: Make `push_deal_to_razor` async, use `await asyncio.sleep()`, use `httpx.AsyncClient`

### P2-6: file_parser Silently Coerces qty=0 to 1 [NEEDS FIX]
- **File**: `backend/app/services/file_parser.py` — `_safe_int` function
- **Issue**: `return max(1, int(float(str(val))))` — buyer submitting qty=0 gets qty=1 silently
- **Fix**: If val == 0, return 0 and flag as exception in caller

---

## Priority 3 — Feature Enhancements

### P3-1: Cloud Deployment Setup [INCOMPLETE]
**Backend** (Render or Railway):
- Add `PRODUCTION=true` env var to disable debug mode
- Set `DATABASE_URL` to production Postgres connection string
- Set all API keys

**Frontend** (Vercel):
- Set `NEXT_PUBLIC_API_URL` to backend domain
- Domain: configure custom domain in Vercel

**Database** (Supabase or Railway):
- Migrate from Docker local PostgreSQL to managed instance
- Run `alembic upgrade head` on production DB

### P3-2: Token Security Hardening [INCOMPLETE]
- **Current**: JWT stored in `localStorage` (vulnerable to XSS)
- **Better**: Store in httpOnly cookies with SameSite=Strict
- Requires: backend `/auth/login` sets cookie, middleware reads cookie, `/auth/logout` clears cookie

### P3-3: Inbound Email Webhook Hardening [INCOMPLETE]
- **File**: `backend/app/api/routes/inbound_email.py`
- Add proper SendGrid webhook signature validation using HMAC
- Fix webhook key to use settings (P1-3 above)
- Add better round ID parsing from subject line

### P3-4: Admin Round Status Toggle (Reopen Closed Round) [INCOMPLETE]
- Currently no way to reopen a closed round without database edit
- Add `POST /rounds/{id}/reopen` endpoint
- Only allowed if status is "closed" (not "complete")

### P3-5: Real-Time Processing Progress [INCOMPLETE]
- Currently processing runs as background task with no progress feedback
- Add WebSocket or SSE endpoint for real-time processing status
- Frontend polls `GET /rounds/{id}` every 3 seconds as current workaround

### P3-6: Buyer Email Notifications for New Rounds [INCOMPLETE]
- `POST /rounds/{id}/invite-buyers` sends emails — [WORKING VERIFIED code path]
- `POST /rounds/{id}/email-results` sends results — [WORKING VERIFIED code path]
- These need `SENDGRID_API_KEY` configured
- Consider: auto-send invites when admin assigns buyers to a round

### P3-7: Admin Round Edit [INCOMPLETE]
- No `PATCH /rounds/{id}` endpoint exists
- Can't edit name, deadline, customer, notes after creation
- Add PUT/PATCH endpoint for mutable fields

### P3-8: Pagination on Bid Lines [INCOMPLETE]
- `GET /rounds/{id}/bid-lines` returns all lines (no limit)
- Rounds with 1000+ lines will be slow
- Add `?page=1&limit=100` query params

---

## Completed Reference (for context)

All items in [FIXED] bugs section of KNOWN_BUGS_AND_FIXES.md were completed.
Full demo prep completed 2026-05-17:
- Docker stack running
- 20 demo deals seeded, $321K total value
- Demo Excel files on Desktop
- End-to-end workflow tested and verified
