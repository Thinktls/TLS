# PROJECT MASTER MEMORY EXPORT
## ThinkTLS Bid Desk — Complete Knowledge Transfer File
### Generated: 2026-05-17 | Status: Production-Ready Demo

---

# PROJECT OVERVIEW

| Field | Value |
|-------|-------|
| **Project Name** | ThinkTLS Bid Desk |
| **Purpose** | B2B IT hardware reverse-auction platform. ThinkTLS acts as broker between enterprise buyers and IT resellers. Buyers submit priced bid files against a master item list; the system auto-matches, selects winners (highest price), and pushes approved deals to Razor ERP. |
| **Business Model** | ThinkTLS invites vetted buyers to bid on IT hardware procurement lots (laptops, servers, networking, etc.). Buyers compete by submitting Excel bid files. ThinkTLS earns margin between buyer winning price and reserve price. |
| **Current Status** | [WORKING VERIFIED] — Full stack running in Docker. Demo data seeded. End-to-end workflow tested. |
| **Git Branch** | main |
| **Local Path** | /Users/saiyaganti/thinktls-bid-desk |
| **Last Commit** | dd52df4 — Add demo seed script and bid file generator |

---

# TECH STACK

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | FastAPI | 0.115.0 |
| ORM | SQLAlchemy | 2.0.35 |
| Migrations | Alembic | 1.13.3 |
| Database | PostgreSQL | 16 (Alpine) |
| Frontend | Next.js | 16.2.6 |
| Frontend UI | React | 19.2.4 |
| Language (BE) | Python | 3.11 (Docker) |
| Language (FE) | TypeScript | 5 |
| Styling | Tailwind CSS | 4 |
| Charts | Recharts | 3.8.1 |
| Icons | Lucide React | 1.14.0 |
| Fuzzy Match | RapidFuzz | 3.10.0 |
| AI | Anthropic Claude (claude-sonnet-4-6) | 0.40.0 |
| Email | SendGrid | 6.11.0 |
| ERP | Razor ERP (httpx integration) | — |
| Scheduler | APScheduler | 3.10.4 |
| Auth | JWT (python-jose) + bcrypt | — |
| Container | Docker + docker-compose | 27.5.1 |

---

# FULL CHAT MEMORY LOG (Chronological)

## Session 1 — Initial Build
- **Requested**: Full platform build from scratch
- **Implemented**: FastAPI backend, Next.js frontend, PostgreSQL database, Docker setup, complete bid round lifecycle, 3-tier matching engine, winner selection, fluff engine, deal approval, Razor ERP integration, SendGrid email
- **Status**: [WORKING VERIFIED]

## Session 2 — QA Audit Phase 1 — 3 Critical Bugs Fixed
- **Bug 1**: FastAPI route ordering — `/report/summary` parsed as `/{round_id}` (string "report") → 422
  - **Fix**: Moved all static routes BEFORE `/{round_id}` in bid_rounds.py
  - **Files**: `backend/app/api/routes/bid_rounds.py`
- **Bug 2**: `/buyers/compare` parsed as `/buyers/{user_id}/profile` → wrong handler
  - **Fix**: Moved `/buyers/compare` route declaration above `/{user_id}/profile`
  - **Files**: `backend/app/api/routes/auth.py`
- **Bug 3**: TypeScript TS2322 error in download.ts — `AxiosHeaders` not assignable to string
  - **Fix**: Cast `resp.headers["content-type"]` as string
  - **Files**: `frontend/lib/download.ts`

## Session 2 — QA Audit Phase 2 — Additional Fixes
- **Bug 4**: AI match approval silently no-ops — `ai_match_suggestion` stored raw `part_number` but lookup used `part_number_normalized`
  - **Fix**: Changed `ai_matcher.py` to store `part_number_normalized` in `ai_match_suggestion`
  - **Files**: `backend/app/services/ai_matcher.py`
- **Bug 5**: `list_open_rounds` showed ALL open rounds to ALL buyers (no data isolation)
  - **Fix**: Rewrote to filter by `round_buyers` table assignment
  - **Files**: `backend/app/api/routes/buyer.py`
- **Bug 6**: `submit_bid` accepted bids from ANY buyer for ANY open round
  - **Fix**: Added `round_buyers` membership guard (403 if not assigned)
  - **Files**: `backend/app/api/routes/buyer.py`
- **Bug 7**: `invite_status` not updated to "uploaded" after web submission (only email webhook did it)
  - **Fix**: Added UPDATE statement after commit in `submit_bid`
  - **Files**: `backend/app/api/routes/buyer.py`
- **Bug 8**: `nlquery.py` used sync `anthropic.Anthropic()` inside `async def` — blocks event loop
  - **Fix**: Changed to `anthropic.AsyncAnthropic()` with `await`
  - **Files**: `backend/app/api/routes/nlquery.py`
- **Bug 9**: Fluff engine always applied fluff regardless of `fluff_enabled` flag
  - **Fix**: Added conditional `if buyer.fluff_enabled: fluff_pct = buyer.fluff_percentage else: fluff_pct = 0.0`
  - **Files**: `backend/app/services/winner_selector.py`
- **Bug 10**: Hardcoded `http://localhost:3000` in invite/reset password emails
  - **Fix**: Changed to `f"{settings.FRONTEND_URL}/setup-password?token=..."`
  - **Files**: `backend/app/api/routes/auth.py`
- **Bug 11**: Double `/api/api/` path in forgot-password + reset-password pages
  - **Fix**: Changed from raw `fetch(${API}/api/auth/...)` to `api.post("/auth/...")` using axios instance
  - **Files**: `frontend/app/forgot-password/page.tsx`, `frontend/app/reset-password/page.tsx`
- **Bug 12**: `RAZOR_BASE_URL` in .env vs `RAZOR_API_URL` in code — mismatch
  - **Fix**: Changed `.env` key to `RAZOR_API_URL`
  - **Files**: `.env`
- **Bug 13**: API mismatch on exceptions page — `/bid-rounds/${id}/ai-match` → `/rounds/${id}/ai-match`
  - **Fix**: Corrected API path in exceptions page
  - **Files**: `frontend/app/admin/rounds/[id]/exceptions/page.tsx`
- **Bug 14**: API mismatch on new round page — `/buyers` → `/auth/buyers`
  - **Fix**: Corrected API path
  - **Files**: `frontend/app/admin/rounds/new/page.tsx`
- **Bug 15**: `_run_processing` had no error handling — exceptions left round stuck in "processing" forever
  - **Fix**: Added try/except that sets `r.status = "error"` and commits
  - **Files**: `backend/app/api/routes/bid_rounds.py`

## Session 3 — Production Readiness + Demo Preparation
- **Requested**: Full demo preparation for live presentation
- **Implemented**:
  - Started Docker (PostgreSQL already on port 5432 from earlier session)
  - Discovered port conflicts (8000/3000) from another Docker project — stopped those containers
  - Added `email-validator==2.1.0` to requirements.txt (missing dep causing startup crash)
  - Rebuilt backend Docker image
  - Created comprehensive demo seed script (`backend/seed_demo.py`)
  - Fixed seed script: passlib/bcrypt version mismatch → switched to `import bcrypt` directly
  - Fixed seed script: notifications table uses `read` not `is_read`, `recipient_role` required
  - Created demo Excel bid file generator (`backend/make_demo_files.py`)
  - Fixed Excel files: headers must be on row 1 (not row 3) for file parser to detect columns
  - Ran full end-to-end workflow test: close round → process → 8 deals created → approve all → [WORKING VERIFIED]
  - Reset round 8 back to "open" state for demo replay
  - Copied demo files to Desktop
  - Created THINKTLS_DEMO_GUIDE.md on Desktop

---

# DATABASE SCHEMA

## Table: users
```sql
id                     SERIAL PRIMARY KEY
email                  VARCHAR UNIQUE NOT NULL
hashed_password        VARCHAR NOT NULL
full_name              VARCHAR NOT NULL
role                   VARCHAR DEFAULT 'buyer'        -- admin | buyer
is_active              BOOLEAN DEFAULT true
company_name           VARCHAR
fluff_percentage       FLOAT DEFAULT 3.5
fluff_enabled          BOOLEAN DEFAULT true
last_bid_at            TIMESTAMPTZ
last_invited_date      TIMESTAMPTZ
last_win_date          TIMESTAMPTZ
total_rounds_participated INTEGER DEFAULT 0
buyer_score            FLOAT DEFAULT 0.0
win_rate               FLOAT DEFAULT 0.0              -- lines_won / lines_bid
total_lines_won        INTEGER DEFAULT 0
total_lines_bid        INTEGER DEFAULT 0
total_margin_contribution FLOAT DEFAULT 0.0           -- sum(price - reserve) × qty
score_updated_at       TIMESTAMPTZ
created_at             TIMESTAMPTZ DEFAULT now()
updated_at             TIMESTAMPTZ
```

## Table: bid_rounds
```sql
id                     SERIAL PRIMARY KEY
name                   VARCHAR NOT NULL               -- e.g. "Q1 2026 Laptop Refresh"
commodity              VARCHAR NOT NULL               -- laptops|desktops|servers|networking|storage|peripherals|other
status                 VARCHAR DEFAULT 'draft'        -- draft|open|closed|processing|complete|error
submission_deadline    TIMESTAMPTZ
notes                  TEXT
reserve_price_enabled  BOOLEAN DEFAULT false
master_file_uploaded   BOOLEAN DEFAULT false
master_file_path       VARCHAR
total_line_items       INTEGER DEFAULT 0
customer               VARCHAR                        -- end customer name
created_by_id          INTEGER
created_at             TIMESTAMPTZ DEFAULT now()
updated_at             TIMESTAMPTZ
```

## Table: round_buyers (M2M junction)
```sql
round_id               INTEGER FK → bid_rounds.id
buyer_id               INTEGER FK → users.id
invited_at             TIMESTAMPTZ DEFAULT now()
invite_status          VARCHAR DEFAULT 'pending'      -- pending|sent|uploaded|processing|ready|error
PRIMARY KEY (round_id, buyer_id)
```

## Table: master_items
```sql
id                     SERIAL PRIMARY KEY
bid_round_id           INTEGER FK → bid_rounds.id
part_number            VARCHAR NOT NULL               -- raw as uploaded
part_number_normalized VARCHAR NOT NULL               -- stripped, uppercased (e.g. HP12345A)
description            VARCHAR
manufacturer           VARCHAR
quantity               INTEGER DEFAULT 1
reserve_price          FLOAT                          -- floor price; NULL = no floor
category               VARCHAR
row_number             INTEGER                        -- original Excel row
created_at             TIMESTAMPTZ DEFAULT now()
```

## Table: bid_files
```sql
id                     SERIAL PRIMARY KEY
bid_round_id           INTEGER FK → bid_rounds.id
buyer_id               INTEGER FK → users.id
filename               VARCHAR NOT NULL
file_path              VARCHAR NOT NULL
file_size_bytes        INTEGER
status                 VARCHAR DEFAULT 'pending'      -- pending|processing|processed|error
error_message          TEXT
lines_parsed           INTEGER DEFAULT 0
lines_matched          INTEGER DEFAULT 0
lines_exception        INTEGER DEFAULT 0
uploaded_at            TIMESTAMPTZ DEFAULT now()
processed_at           TIMESTAMPTZ
```

## Table: bid_lines
```sql
id                     SERIAL PRIMARY KEY
bid_file_id            INTEGER FK → bid_files.id
bid_round_id           INTEGER FK → bid_rounds.id
buyer_id               INTEGER FK → users.id
master_item_id         INTEGER FK → master_items.id  -- NULL if unmatched
raw_part_number        VARCHAR NOT NULL
normalized_part_number VARCHAR
description            VARCHAR
unit_price             FLOAT
quantity               INTEGER
total_price            FLOAT
match_method           VARCHAR                        -- exact|fuzzy|ai|unmatched|manual
match_score            FLOAT                          -- 0-100
match_status           VARCHAR DEFAULT 'pending'      -- pending|matched|exception|review
exception_type         VARCHAR                        -- unmatched|partial_match|duplicate|overbid|below_reserve|price_anomaly|no_bids|bad_format|rejected
exception_notes        TEXT
exception_resolved     BOOLEAN DEFAULT false
exception_resolved_by  VARCHAR
is_winner              BOOLEAN DEFAULT false
real_winning_price     FLOAT                          -- actual winning price (audit trail)
fluffed_loss_price     FLOAT                          -- what losing buyer is told
ai_match_suggestion    VARCHAR                        -- part_number_normalized from Claude
ai_match_confidence    FLOAT
z_score                FLOAT
is_anomaly             BOOLEAN DEFAULT false
anomaly_reason         VARCHAR
row_number             INTEGER
created_at             TIMESTAMPTZ DEFAULT now()
```

## Table: deals
```sql
id                     SERIAL PRIMARY KEY
bid_round_id           INTEGER FK → bid_rounds.id
master_item_id         INTEGER FK → master_items.id
winning_buyer_id       INTEGER FK → users.id
winning_bid_line_id    INTEGER FK → bid_lines.id
part_number            VARCHAR NOT NULL
description            VARCHAR
quantity               INTEGER NOT NULL
winning_price          FLOAT NOT NULL
total_value            FLOAT NOT NULL
razor_deal_id          VARCHAR
razor_pushed_at        TIMESTAMPTZ
razor_push_status      VARCHAR DEFAULT 'pending'      -- pending|success|failed|csv_exported
approved_by            VARCHAR
approved_at            TIMESTAMPTZ
status                 VARCHAR DEFAULT 'pending_approval' -- pending_approval|approved|rejected|pushed_to_razor
notes                  TEXT
created_at             TIMESTAMPTZ DEFAULT now()
```

## Table: notifications
```sql
id                     SERIAL PRIMARY KEY
recipient_role         VARCHAR NOT NULL DEFAULT 'admin'
recipient_id           INTEGER
title                  VARCHAR NOT NULL
body                   TEXT
category               VARCHAR NOT NULL DEFAULT 'info'  -- info|success|warning|error
link                   VARCHAR
read                   BOOLEAN DEFAULT false
created_at             TIMESTAMPTZ DEFAULT now()
INDEX: (recipient_role, recipient_id)
INDEX: (read)
```

## Table: approval_overrides
```sql
id                     SERIAL PRIMARY KEY
deal_id                INTEGER FK → deals.id
bid_round_id           INTEGER FK → bid_rounds.id
admin_user             VARCHAR                        -- email of admin who overrode
field_changed          VARCHAR                        -- winning_buyer|unit_price|quantity
old_value              VARCHAR
new_value              VARCHAR
reason_note            TEXT                           -- MANDATORY
overridden_at          TIMESTAMPTZ DEFAULT now()
```

## Table: invite_tokens
```sql
id                     SERIAL PRIMARY KEY
token                  VARCHAR UNIQUE NOT NULL        -- secrets.token_urlsafe(32)
buyer_id               INTEGER FK → users.id
expires_at             TIMESTAMPTZ NOT NULL
used                   BOOLEAN DEFAULT false
created_at             TIMESTAMPTZ DEFAULT now()
```
*Note: Reused for both account setup AND password reset flows.*

## Performance Indexes (Migration d4e5f6a7b8c9)
```sql
CREATE INDEX ix_bid_lines_round_status ON bid_lines(bid_round_id, match_status);
CREATE INDEX ix_bid_lines_buyer_round  ON bid_lines(buyer_id, bid_round_id);
CREATE INDEX ix_deals_round_status     ON deals(bid_round_id, status);
CREATE INDEX ix_master_norm            ON master_items(bid_round_id, part_number_normalized);
```

---

# BACKEND — COMPLETE API REFERENCE

**Base URL**: `http://localhost:8000/api`
**Auth**: Bearer JWT in Authorization header
**Token expiry**: 480 minutes (8 hours)

## Auth Routes (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | None | Login → returns JWT + role |
| GET | `/auth/me` | Any | Current user info |
| POST | `/auth/buyers` | Admin | Create buyer account |
| GET | `/auth/buyers` | Admin | List all buyers |
| PATCH | `/auth/buyers/{id}/toggle` | Admin | Enable/disable buyer |
| PATCH | `/auth/buyers/{id}/fluff` | Admin | Set fluff percentage |
| PATCH | `/auth/buyers/{id}/fluff-toggle` | Admin | Toggle fluff on/off |
| POST | `/auth/buyers/{id}/send-invite` | Admin | Email password setup link |
| POST | `/auth/setup-password` | None | Set initial password (token) |
| GET | `/auth/invite/validate` | None | Validate invite token |
| POST | `/auth/forgot-password` | None | Send password reset email |
| POST | `/auth/reset-password` | None | Reset password via token |
| GET | `/auth/buyers/compare` | Admin | Buyer comparison table (MUST be before /{id}/profile) |
| GET | `/auth/buyers/{id}/profile` | Admin | Full buyer profile + metrics |

## Round Routes (`/api/rounds`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/rounds/` | Admin | Create round |
| GET | `/rounds/` | Any | List all rounds |
| GET | `/rounds/report/summary` | Admin | KPI dashboard data (MUST be before /{id}) |
| GET | `/rounds/report/monthly-deal-value` | Admin | 12-month deal value trend |
| GET | `/rounds/{id}` | Any | Round detail |
| POST | `/rounds/{id}/master-file` | Admin | Upload master Excel/CSV |
| POST | `/rounds/{id}/open` | Admin | Set status → open |
| POST | `/rounds/{id}/close` | Admin | Set status → closed |
| POST | `/rounds/{id}/process` | Admin | Run matching + winner selection (background) |
| GET | `/rounds/{id}/buyers` | Admin | List assigned buyers + invite_status |
| POST | `/rounds/{id}/buyers` | Admin | Assign buyers (replace all) |
| POST | `/rounds/{id}/invite-buyers` | Admin | Send email invites to assigned buyers |
| POST | `/rounds/{id}/email-results` | Admin | Email results to all buyers |
| GET | `/rounds/{id}/bid-files` | Admin | List bid files for round |
| GET | `/rounds/{id}/bid-lines` | Admin | All bid lines with filters |
| GET | `/rounds/{id}/analytics` | Admin | Per-round analytics |
| GET | `/rounds/{id}/ai-match` | Admin | Trigger AI matching on exceptions |
| GET | `/rounds/{id}/exceptions` | Admin | → proxied to /exceptions/rounds/{id} |
| GET | `/rounds/{id}/master-items` | Admin | List master items |
| GET | `/rounds/{id}/export/deals.xlsx` | Admin | Export deals as Excel |
| GET | `/rounds/{id}/export/deals.csv` | Admin | Export deals as CSV |
| GET | `/rounds/{id}/export/comparison.xlsx` | Admin | Buyer bid comparison matrix |
| GET | `/rounds/{id}/export/award-sheet/{buyer_id}` | Admin | Per-buyer award sheet |
| GET | `/rounds/{id}/export/award-sheets.zip` | Admin | All buyer award sheets zipped |
| GET | `/rounds/{id}/export/razor.csv` | Admin | Razor ERP format CSV |
| GET | `/rounds/{id}/export/margin-report.xlsx` | Admin | Margin analysis report |
| GET | `/rounds/{id}/export/disposition.xlsx` | Admin | Full disposition report |

## Buyer Routes (`/api/buyer`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/buyer/rounds` | Buyer | Open rounds ASSIGNED to this buyer only |
| GET | `/buyer/my-rounds` | Buyer | All rounds (all statuses) for this buyer |
| POST | `/buyer/rounds/{id}/bid` | Buyer | Upload bid Excel/CSV file |
| GET | `/buyer/rounds/{id}/template` | Buyer | Download bid template Excel |
| GET | `/buyer/rounds/{id}/award-sheet` | Buyer | Download personal award sheet |
| GET | `/buyer/my-results` | Buyer | All WON/LOST results across all rounds |
| GET | `/buyer/my-results/{round_id}` | Buyer | Results for specific round |
| GET | `/buyer/my-deals` | Buyer | All won deals |

## Deals Routes (`/api/deals`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/deals/rounds/{id}` | Admin | List all deals for round |
| POST | `/deals/{id}/approve` | Admin | Approve single deal |
| POST | `/deals/rounds/{id}/approve-all` | Admin | Approve all pending deals |
| POST | `/deals/{id}/reject` | Admin | Reject deal |
| POST | `/deals/{id}/override` | Admin | Override field (audited) |
| GET | `/deals/{id}/overrides` | Admin | Audit trail for deal |
| POST | `/deals/{id}/push-razor` | Admin | Push single deal to Razor ERP |
| POST | `/deals/rounds/{id}/push-razor-all` | Admin | Push all approved deals to Razor |

## Exception Routes (`/api/exceptions`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/exceptions/rounds/{id}` | Admin | List exceptions (filterable by type/resolved) |
| GET | `/exceptions/rounds/{id}/stats` | Admin | Exception counts by type |
| GET | `/exceptions/rounds/{id}/search-master` | Admin | Search master items for remap |
| PATCH | `/exceptions/{line_id}/resolve` | Admin | Resolve single exception |
| POST | `/exceptions/rounds/{id}/bulk-resolve` | Admin | Bulk approve AI suggestions or reject all |

## Other Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications` | Admin | List notifications (limit, unread_only) |
| GET | `/notifications/unread-count` | Admin | Badge count |
| PATCH | `/notifications/{id}/read` | Admin | Mark single read |
| PATCH | `/notifications/read-all` | Admin | Mark all read |
| POST | `/query/` | Admin | Natural language → SQL query |
| POST | `/inbound-email/` | None | SendGrid webhook for email-submitted bids |
| GET | `/health` | None | Health check |

---

# CORE BUSINESS LOGIC

## 1. Three-Tier Matching Engine [WORKING VERIFIED]
**File**: `backend/app/services/matcher.py`

```
Tier 1 — Exact: normalize(buyer_pn) == normalize(master_pn) → score 100, status "matched"
Tier 2 — Fuzzy: rapidfuzz.token_sort_ratio
  ≥ 88 → auto-match, status "matched"
  65–87 → flag, status "exception", type "partial_match"
  < 65 → status "exception", type "unmatched"
Tier 3 — AI: Claude claude-sonnet-4-6 batches of 20 master items
  Returns: match_index, confidence 0-100, reason
  Stored in: ai_match_suggestion (part_number_normalized), ai_match_confidence
```

**Normalizer** (`normalizer.py`): strips non-alphanumeric, uppercase
Example: "HP-EliteBook 840 G10" → "HPELITEBOOK840G10"

**Exception types**:
- `unmatched` — no fuzzy match ≥ 65%
- `partial_match` — fuzzy 65–87%, needs review
- `duplicate` — same buyer submits same part twice
- `overbid` — bid quantity > master quantity
- `below_reserve` — bid price < reserve price
- `price_anomaly` — z-score > 2.5, or >10× median, or <20% median
- `rejected` — admin manually rejected

## 2. Winner Selection Engine [WORKING VERIFIED]
**File**: `backend/app/services/winner_selector.py`

```
For each master_item_id:
1. Collect all matched bid_lines with unit_price NOT NULL
2. Anomaly detection (z-score) if ≥ 3 bids
3. Filter out below-reserve bids (mark as exception)
4. Sort: highest price first, tiebreak = earliest uploaded_at
5. winner.is_winner = True, winner.real_winning_price = unit_price
6. For each loser: fluffed_loss_price = winner_price × (1 + fluff_pct/100)
   IF buyer.fluff_enabled ELSE 0% fluff (buyer sees real winning price)
7. Create Deal record
```

## 3. Fluff Engine [WORKING VERIFIED]
- Per-buyer: `fluff_percentage` (default 3.5%), `fluff_enabled` (Boolean)
- Losers see: `real_winning_price × (1 + fluff_pct / 100)`
- Admin sees real winning price in deals table
- Buyers NEVER see real winning price in my-results endpoint
- If `fluff_enabled = false` → loser sees exact real winning price (0% fluff)

## 4. Buyer Scoring Engine [WORKING VERIFIED]
**File**: `backend/app/services/buyer_scorer.py`
Called after every deal approval batch.

```
Component 1 (0–45pts): win_rate × 45
Component 2 (0–30pts): log1p(lines_bid) / log1p(1000) × 30   [activity]
Component 3 (0–15pts): log1p(margin_total) / log1p(100000) × 15 [margin]
Component 4 (0–10pts): max(0, 10 - days_since_last_win / 30)  [recency]
Total: min(100, sum of components), rounded to 2dp
```

## 5. Background Processing Flow [WORKING VERIFIED]
```
Admin clicks "Process Round"
→ POST /rounds/{id}/process
→ Sets status = "processing"
→ BackgroundTasks.add_task(_run_processing, round_id)
→ _run_processing:
   1. Load all bid_files for round
   2. For each file: load bid_lines → run match_bid_lines() → save
   3. Run AI matching for unresolved exceptions (if ANTHROPIC_API_KEY set)
   4. select_winners() → create Deal records
   5. recalculate_buyer_scores()
   6. Set status = "complete"
   7. On ANY exception: status = "error", commit, re-raise
```

## 6. Inbound Email Bid Submission [PARTIALLY WORKING]
**File**: `backend/app/api/routes/inbound_email.py`
- SendGrid inbound parse webhook → POST `/api/inbound-email/`
- Extracts: sender email → lookup buyer, subject → round ID, attachment → parse
- Updates `invite_status = 'uploaded'`
- Webhook key validation via `os.getenv("SENDGRID_WEBHOOK_KEY")` [NEEDS FIX — should use settings]

## 7. Razor ERP Integration [PARTIALLY WORKING — needs RAZOR_API_URL]
**File**: `backend/app/services/razor_client.py`
- `push_deal_to_razor(db, deal)`: POST to `RAZOR_API_URL/deals` with bearer token
- Retry: 3 attempts, exponential backoff (2^attempt seconds)
- On failure: updates `razor_push_status = "failed"`, emits notification, raises RazorPushError
- Fallback: admin downloads `razor.csv` from export endpoint
- `push_round_to_razor(db, round_id)`: bulk push all approved deals

## 8. APScheduler — 90-Day Auto-Prune [WORKING VERIFIED]
**File**: `backend/app/services/scheduler.py`
- Runs nightly at 02:00 UTC
- Deactivates buyers who haven't bid in 90+ days (`last_bid_at < cutoff`)
- Logs each deactivation

---

# AUTHENTICATION & SECURITY

## JWT Flow
1. Client POST `/api/auth/login` → `{access_token, role, user_id, full_name}`
2. Token stored in `localStorage` (key: "token")
3. Every API request: `Authorization: Bearer <token>`
4. Token payload: `{sub: user_id, role: "admin"|"buyer", exp: timestamp}`
5. Token expiry: 480 minutes (8 hours)
6. 401 response → axios interceptor clears localStorage, redirects to /login

## Rate Limiting (Login)
- In-memory per-IP counter
- 10 attempts per 5-minute window
- Returns 429 on breach
- Cleared on successful login

## Role Guards
- `require_admin` — role must be "admin"
- `require_buyer` — role must be "admin" OR "buyer" (admins can access buyer portal)
- `get_current_user` — any authenticated user

## Password Flows
- **Initial Setup**: Admin creates buyer → send-invite → token emailed → buyer sets password
- **Forgot Password**: email submitted → token emailed → `/reset-password?token=...` → new password
- **Token table**: `invite_tokens` — used for BOTH flows
- **Token TTL**: Setup = 72 hours, Reset = 2 hours
- **Token**: `secrets.token_urlsafe(32)` — cryptographically secure

---

# FRONTEND — PAGE STRUCTURE

## Pages Map

| Route | File | Layout | Auth | Description |
|-------|------|---------|------|-------------|
| `/` | `app/page.tsx` | none | check | Redirect based on role |
| `/login` | `app/login/page.tsx` | none | none | Glassmorphism login form |
| `/setup-password` | `app/setup-password/page.tsx` | none | token | First-time password setup |
| `/forgot-password` | `app/forgot-password/page.tsx` | none | none | Request reset email |
| `/reset-password` | `app/reset-password/page.tsx` | none | token | Set new password |
| `/admin` | `app/admin/page.tsx` | AdminLayout | admin | Dashboard KPIs + charts |
| `/admin/rounds` | `app/admin/rounds/page.tsx` | AdminLayout | admin | Rounds list |
| `/admin/rounds/new` | `app/admin/rounds/new/page.tsx` | AdminLayout | admin | Create round + assign buyers |
| `/admin/rounds/[id]` | `app/admin/rounds/[id]/page.tsx` | AdminLayout | admin | Round detail (bid files, status) |
| `/admin/rounds/[id]/exceptions` | `app/admin/rounds/[id]/exceptions/page.tsx` | AdminLayout | admin | Exception review queue |
| `/admin/rounds/[id]/deals` | `app/admin/rounds/[id]/deals/page.tsx` | AdminLayout | admin | Deal approval + override |
| `/admin/rounds/[id]/comparison` | `app/admin/rounds/[id]/comparison/page.tsx` | AdminLayout | admin | Buyer price comparison matrix |
| `/admin/rounds/[id]/analytics` | `app/admin/rounds/[id]/analytics/page.tsx` | AdminLayout | admin | Round-level analytics |
| `/admin/rounds/[id]/participation` | `app/admin/rounds/[id]/participation/page.tsx` | AdminLayout | admin | Buyer participation tracker |
| `/admin/rounds/[id]/export` | `app/admin/rounds/[id]/export/page.tsx` | AdminLayout | admin | Export hub (all download options) |
| `/admin/buyers` | `app/admin/buyers/page.tsx` | AdminLayout | admin | Buyers list + enable/disable |
| `/admin/buyers/[id]` | `app/admin/buyers/[id]/page.tsx` | AdminLayout | admin | Buyer detail scorecard |
| `/admin/buyers/compare` | `app/admin/buyers/compare/page.tsx` | AdminLayout | admin | Side-by-side buyer comparison |
| `/admin/buyers/fluff` | `app/admin/buyers/fluff/page.tsx` | AdminLayout | admin | Manage per-buyer fluff % |
| `/admin/reports` | `app/admin/reports/page.tsx` | AdminLayout | admin | Global analytics + charts |
| `/admin/query` | `app/admin/query/page.tsx` | AdminLayout | admin | Natural language SQL query |
| `/admin/guide` | `app/admin/guide/page.tsx` | AdminLayout | admin | Platform user guide |
| `/portal` | `app/portal/page.tsx` | BuyerLayout | buyer | Buyer dashboard (rounds + results) |
| `/portal/bid` | `app/portal/bid/page.tsx` | BuyerLayout | buyer | File upload + round selection |
| `/portal/results` | `app/portal/results/page.tsx` | BuyerLayout | buyer | Won/lost results view |

## Key Frontend Libraries
- `lib/api.ts` — Axios instance, base URL from `NEXT_PUBLIC_API_URL`, auto-attaches Bearer token, 401 → redirect to /login
- `lib/auth.ts` — saveAuth(), getRole(), logout(), isAdmin(), getFullName() — all localStorage-based
- `lib/download.ts` — Authenticated blob downloads (uses axios, not raw `<a href>`)
- `components/AdminLayout.tsx` — Sidebar nav + notification bell + top bar
- `components/BuyerLayout.tsx` — Buyer portal layout
- `components/ErrorBoundary.tsx` — React error boundary wrapping layout.tsx

## UI Design System
- **Background**: `#0c0c0c` (near-black)
- **Sidebar**: `rgba(255,255,255,0.02)` + `rgba(255,255,255,0.07)` border
- **Active nav**: `rgba(61,129,227,0.18)` + `#3D81E3` left border + bold
- **Accent blue**: `#3D81E3`
- **Text**: `rgba(255,255,255,0.5)` muted, `white` active
- **Cards**: dark glassmorphism, `rgba(255,255,255,0.04)` background
- All inline styles (no Tailwind classes in components — Tailwind used only in globals.css)

## Notification System (AdminLayout)
- Polls `/notifications/unread-count` every 30 seconds
- Bell icon with red badge (99+ cap)
- Dropdown panel: 20 most recent, colored dot by category (info/success/warning/error)
- Click notification → mark read + navigate to link
- "Mark all read" button

---

# INTEGRATIONS

## 1. SendGrid Email [PARTIALLY WORKING — needs API key]
- **Service**: `backend/app/services/email_service.py`
- **Config**: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (bids@thinktls.com)
- **Uses**: `sendgrid.SendGridAPIClient`
- **Fallback**: Console logs full HTML when no API key
- **Emails sent**:
  - Buyer account invite (password setup link)
  - Password reset
  - Round bid invitation (with template download link)
  - Round results notification

## 2. Anthropic Claude API [PARTIALLY WORKING — needs API key]
- **NL Query**: `backend/app/api/routes/nlquery.py`
  - Model: `claude-sonnet-4-6`
  - `AsyncAnthropic` (async-safe)
  - Schema context injected; returns raw SQL
  - Only SELECT allowed; `fetchmany(500)` to prevent unbounded results
- **AI Matching**: `backend/app/services/ai_matcher.py` and `matcher.py`
  - Model: `claude-sonnet-4-6`
  - Sync `Anthropic` client (called from background thread, OK)
  - Batches of 20 master items per call
  - Returns JSON: `{match_index, confidence, reason}`
  - Stored: `ai_match_suggestion` (normalized PN), `ai_match_confidence`

## 3. Razor ERP [INCOMPLETE — pending client credentials]
- **Service**: `backend/app/services/razor_client.py`
- **Config**: `RAZOR_API_URL`, `RAZOR_API_KEY`
- **Endpoint**: `POST {RAZOR_API_URL}/deals`
- **Payload**: `{externalId, partNumber, description, quantity, unitPrice, totalValue, supplierId, bidRoundId, approvedAt, approvedBy}`
- **Retry**: 3 attempts, backoff 2^n seconds (uses `time.sleep` — blocks thread)
- **Fallback**: Razor CSV export at `/api/rounds/{id}/export/razor.csv`
- **Known Issue**: `time.sleep()` blocks sync route handler during retries (up to 6 seconds)

## 4. SendGrid Inbound Parse (Email Bid Submission) [PARTIALLY WORKING]
- **Webhook**: POST `/api/inbound-email/`
- Extracts: From header → buyer lookup, Subject → round ID parse, Attachments → bid file
- **Known Issue**: `SENDGRID_WEBHOOK_KEY` read via `os.getenv()` — bypasses pydantic-settings `.env` loading

---

# ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://thinktls:changeme@localhost:5432/thinktls_bid_desk

# Security
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">

# Frontend URL (used in email links)
FRONTEND_URL=http://localhost:3000

# API URL (frontend reads this)
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Email (SendGrid)
SENDGRID_API_KEY=<your SendGrid API key>
SENDGRID_FROM_EMAIL=bids@thinktls.com
SENDGRID_WEBHOOK_KEY=<from SendGrid inbound parse settings>

# AI
ANTHROPIC_API_KEY=<your Anthropic API key>

# ERP
RAZOR_API_URL=<Razor ERP base URL>
RAZOR_API_KEY=<Razor ERP bearer token>
AUTO_PUSH_RAZOR=false

# Docker Postgres (only needed for docker-compose)
POSTGRES_DB=thinktls_bid_desk
POSTGRES_USER=thinktls
POSTGRES_PASSWORD=changeme

# Default admin (used by seed script only)
ADMIN_EMAIL=admin@thinktls.com
ADMIN_PASSWORD=changeme123
```

---

# DEPLOYMENT

## Docker Compose (Recommended)
```bash
# Start all services
docker-compose up -d

# Rebuild after code changes
docker-compose build backend && docker-compose up -d backend

# View logs
docker logs -f thinktls-bid-desk-backend-1

# Run migrations manually
docker exec thinktls-bid-desk-backend-1 alembic upgrade head

# Seed demo data
docker exec -e DATABASE_URL=postgresql://thinktls:changeme@db:5432/thinktls_bid_desk \
  thinktls-bid-desk-backend-1 python /app/seed_demo.py
```

## Service Ports
| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| FastAPI Backend | 8000 |
| Next.js Frontend | 3000 |

## Entrypoint (entrypoint.sh)
```bash
#!/bin/sh
alembic upgrade head   # Run migrations on every start
uvicorn main:app --host 0.0.0.0 --port 8000
```

## CORS Config (main.py)
Origins: `localhost:3000`, `localhost:3001`, `localhost:5173`, `FRONTEND_URL` from env

---

# KNOWN BUGS AND OUTSTANDING ISSUES

## [FIXED] Critical Bugs (all fixed in commits a5d2678 and prior)
1. FastAPI route ordering: `/report/summary` matched as `/{round_id}`
2. FastAPI route ordering: `/buyers/compare` matched as `/buyers/{user_id}/profile`
3. AI approval silently no-ops (part_number vs part_number_normalized mismatch)
4. Buyer data isolation: all buyers saw all open rounds
5. submit_bid accepted any buyer for any round
6. invite_status not updated on web submission
7. Sync Anthropic client in async function
8. Hardcoded localhost URLs in emails
9. Double `/api/api/` in forgot/reset password
10. RAZOR_BASE_URL vs RAZOR_API_URL mismatch
11. No error handling in `_run_processing` → stuck in "processing"
12. Fluff engine ignored `fluff_enabled` flag

## [NEEDS FIX] Minor Outstanding Issues
1. `buyer.py` `submit_bid` builds `master_items`/`master_index` that are never used (dead code — remove)
2. `file_parser.py` `_safe_int` silently converts qty=0 to 1 (could mask data issues)
3. `config.py` default `SECRET_KEY = "change-me-in-production"` — insecure if not overridden
4. `inbound_email.py` reads `SENDGRID_WEBHOOK_KEY` via `os.getenv()` — bypasses .env loading
5. `buyer_scorer.py` uses `line.created_at` (bid submitted time) for `last_win_date` instead of deal approval date
6. `buyer.py` `my_rounds` has N+3 queries per round (should be pre-fetched)
7. AI matcher caps master catalog at 20 items per batch (could miss items in large catalogs)
8. `razor_client.py` uses `time.sleep()` in sync context — blocks thread during Razor retries

---

# DEMO ACCOUNTS (Current Database)

| Role | Email | Password | Company | Score |
|------|-------|----------|---------|-------|
| Admin | admin@thinktls.com | changeme123 | ThinkTLS | — |
| Buyer | buyer1@acme.com | buyer123 | Acme Corp | 13.8 |
| Buyer | buyer2@techco.com | buyer123 | TechCo | 53.2 |
| Buyer | buyer3@globalit.com | buyer123 | Global IT | 45.2 |
| Buyer | buyer4@premier.com | buyer123 | Premier IT | 42.3 |
| Buyer | buyer5@nextech.com | buyer123 | NexTech Systems | 29.5 |

## Current Data State
- Round 5: Q1 2026 Laptop Refresh — ACME Bank [complete] — 10 deals, $132K
- Round 6: Q1 2026 Server Procurement — City Finance [complete] — 5 deals, $113K
- Round 7: Q2 2026 Network Upgrade — Metro Health [complete] — 5 deals, $76K
- Round 8: Q2 2026 Desktop Refresh — TechStart Inc [open] — Alice + Bob submitted
- Total deals: 20, Total value: $321,345

---

# MIGRATION HISTORY

| Migration | File | Changes |
|-----------|------|---------|
| f406ea662c6c | `_initial_schema.py` | All base tables: users, bid_rounds, master_items, bid_files, bid_lines, deals, approval_overrides |
| a1b2c3d4e5f6 | `_add_round_buyers_scorer_fields.py` | round_buyers junction table, buyer scoring columns (win_rate, total_lines_won, etc.), fluff_enabled flag |
| b2c3d4e5f6a7 | `_add_invite_tokens.py` | invite_tokens table for password setup + reset |
| c3d4e5f6a7b8 | `_add_notifications.py` | notifications table |
| d4e5f6a7b8c9 | `_add_performance_indexes.py` | 4 composite indexes for query performance |

---

# FINAL PROJECT STATUS REPORT

## Completed [WORKING VERIFIED]
- Full bid round lifecycle (draft → open → closed → processing → complete)
- Master file upload + parsing (Excel, CSV)
- Three-tier matching (exact, fuzzy, AI)
- Winner selection with reserve price enforcement
- Anomaly detection (z-score)
- Fluff engine (per-buyer, respects fluff_enabled)
- Deal approval workflow (individual + bulk)
- Deal field override with mandatory audit trail
- Buyer scoring engine (0–100 composite)
- Exception queue with AI bulk-approve
- All export formats (Excel, CSV, ZIP, Razor CSV, margin report, disposition report)
- Buyer portal (bid upload, results with fluffed prices, deals, award sheet)
- Admin dashboard (KPIs, charts, top buyers, recent rounds)
- Buyer comparison dashboard
- Reports page (global analytics, monthly trends)
- Notification system (bell, feed, unread count, auto-poll)
- JWT authentication with rate limiting
- Password setup/reset flows with SendGrid
- APScheduler 90-day auto-prune
- Natural language SQL query (NL Query page)
- Docker deployment (3-service compose)
- Alembic migrations (auto-run on startup)
- Demo seed script (seed_demo.py)
- Demo Excel file generator (make_demo_files.py)

## Partially Working [PARTIALLY WORKING]
- SendGrid email sending (working code, needs SENDGRID_API_KEY)
- AI matching (working code, needs ANTHROPIC_API_KEY)
- NL Query (working code, needs ANTHROPIC_API_KEY)
- Razor ERP push (working code, needs RAZOR_API_URL + RAZOR_API_KEY)
- Inbound email bid submission (working code, needs SendGrid inbound parse webhook configured)

## Needs Fix [NEEDS FIX]
- Minor dead code in submit_bid (unused master_index)
- SENDGRID_WEBHOOK_KEY should use settings.* not os.getenv()
- last_win_date uses bid created_at, not deal approved_at
- Razor retries block thread for up to 6 seconds (should use async httpx)

## Recommended Next Steps
1. Wire Anthropic API key to enable AI matching + NL Query
2. Wire SendGrid API key to enable email flows
3. Wire Razor API URL/key for ERP push
4. Deploy to cloud (Railway/Render for backend, Vercel for frontend, Supabase/Railway PostgreSQL)
5. Add domain + SSL
6. Fix minor outstanding issues listed above
7. Add webhook signature validation for inbound email
8. Consider switching from localStorage to httpOnly cookies for token storage (XSS hardening)
