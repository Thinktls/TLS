# KNOWN BUGS AND FIXES
## ThinkTLS Bid Desk — Complete Bug History

---

## Fixed Bugs (All Resolved)

---

### BUG-01: FastAPI Route Ordering — /report/summary Returns 422
- **Status**: [FIXED]
- **Severity**: Critical
- **Description**: `GET /api/rounds/report/summary` was being matched by the `/{round_id}` route before the literal `/report/summary` route because it was declared later. FastAPI passed "report" as `round_id` (an int), causing a 422 Validation Error.
- **Cause**: FastAPI matches routes in declaration order. Parameterized routes must come AFTER literal routes.
- **Files Affected**: `backend/app/api/routes/bid_rounds.py`
- **Reproduction**: Call `GET /api/rounds/report/summary` with valid admin token
- **Fix Applied**: Moved `@router.get("/report/summary")` and `@router.get("/report/monthly-deal-value")` to before `@router.get("/{round_id}")`
- **Same Pattern**: Also applied to `/auth/buyers/compare` vs `/auth/buyers/{user_id}/profile`

---

### BUG-02: FastAPI Route Ordering — /buyers/compare Returns Wrong Data
- **Status**: [FIXED]
- **Severity**: Critical
- **Description**: `GET /api/auth/buyers/compare` was matched by `/{user_id}/profile` route. "compare" was parsed as user_id (fails int validation) returning 422.
- **Files Affected**: `backend/app/api/routes/auth.py`
- **Fix Applied**: Moved `@router.get("/buyers/compare")` above `@router.get("/buyers/{user_id}/profile")`

---

### BUG-03: TypeScript TS2322 in download.ts
- **Status**: [FIXED]
- **Severity**: Minor
- **Description**: `resp.headers["content-type"]` is typed as `AxiosHeaders | string | number | boolean | null` — not assignable to `Blob` options `type: string | undefined`
- **Files Affected**: `frontend/lib/download.ts` line 10
- **Fix Applied**: Cast to string: `(resp.headers["content-type"] as string) || "application/octet-stream"`

---

### BUG-04: AI Match Approval Silently No-Ops
- **Status**: [FIXED]
- **Severity**: Critical
- **Description**: When admin approves an AI suggestion in the exceptions queue, the system looks up the master item by `part_number_normalized`. But `ai_match_suggestion` was being set to `master.part_number` (raw), not `master.part_number_normalized`. The lookup in exceptions.py always failed (None), so approval accepted but never actually remapped the line to the master item.
- **Files Affected**: `backend/app/services/ai_matcher.py`
- **Fix Applied**: Changed `line.ai_match_suggestion = matched_master.part_number` → `matched_master.part_number_normalized`

---

### BUG-05: Buyer Data Isolation — All Buyers See All Rounds
- **Status**: [FIXED]
- **Severity**: Critical (security)
- **Description**: `GET /api/buyer/rounds` returned all open rounds without filtering by the `round_buyers` assignment table. Any buyer could see any open round.
- **Files Affected**: `backend/app/api/routes/buyer.py` — `list_open_rounds()`
- **Fix Applied**: Full rewrite — query `round_buyers` first to get assigned round IDs, then filter `BidRound` query to `id.in_(assigned_round_ids)`

---

### BUG-06: submit_bid Has No Assignment Check
- **Status**: [FIXED]
- **Severity**: Critical (security)
- **Description**: `POST /api/buyer/rounds/{id}/bid` accepted bids from any authenticated buyer regardless of whether they were assigned to the round. Any buyer could submit to any round.
- **Files Affected**: `backend/app/api/routes/buyer.py` — `submit_bid()`
- **Fix Applied**: Added query against `round_buyers` table; returns 403 if buyer not assigned.

---

### BUG-07: invite_status Not Updated on Web Bid Submission
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: After a buyer uploads a bid file via the web portal, their `invite_status` in `round_buyers` remained "sent" instead of being updated to "uploaded". The inbound email webhook correctly updated it but the REST API path didn't.
- **Files Affected**: `backend/app/api/routes/buyer.py` — `submit_bid()`
- **Fix Applied**: Added `UPDATE round_buyers SET invite_status='uploaded' WHERE ...` after successful commit.

---

### BUG-08: Sync Anthropic Client Blocks Event Loop
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: `nlquery.py` used `anthropic.Anthropic()` (synchronous) inside `async def _translate_to_sql()`. Calling `.create()` on a sync client inside an async function blocks the entire uvicorn event loop for the duration of the API call (~1-3 seconds).
- **Files Affected**: `backend/app/api/routes/nlquery.py`
- **Fix Applied**: Changed to `anthropic.AsyncAnthropic()` and `await client.messages.create()`

---

### BUG-09: Fluff Engine Ignores fluff_enabled Flag
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: Winner selector applied fluff to all losing buyers regardless of whether `fluff_enabled = False` on their account. Buyers with fluff disabled should see the real winning price.
- **Files Affected**: `backend/app/services/winner_selector.py`
- **Fix Applied**: 
  ```python
  if buyer and buyer.fluff_enabled:
      fluff_pct = buyer.fluff_percentage
  elif not buyer:
      fluff_pct = settings.FLUFF_PERCENTAGE  # global default if buyer not found
  else:
      fluff_pct = 0.0  # fluff disabled
  ```

---

### BUG-10: Hardcoded localhost:3000 in Email Links
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: Both `send_invite` and `forgot_password` had hardcoded `http://localhost:3000/setup-password?token=...`. In any non-local environment (staging, production), email links would point to localhost.
- **Files Affected**: `backend/app/api/routes/auth.py`
- **Fix Applied**: Changed to `f"{settings.FRONTEND_URL}/setup-password?token={token_str}"` and `f"{settings.FRONTEND_URL}/reset-password?token={token_str}"`

---

### BUG-11: Double /api/api/ Path in Forgot/Reset Password
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: `NEXT_PUBLIC_API_URL = http://localhost:8000/api`. Pages used raw `fetch(${API}/api/auth/forgot-password)` — resulting in `http://localhost:8000/api/api/auth/forgot-password` (double /api).
- **Files Affected**: `frontend/app/forgot-password/page.tsx`, `frontend/app/reset-password/page.tsx`
- **Fix Applied**: Replaced raw `fetch()` calls with `await api.post("/auth/forgot-password", ...)` and `await api.post("/auth/reset-password", ...)` using the axios `api` instance from `lib/api.ts`

---

### BUG-12: RAZOR_BASE_URL vs RAZOR_API_URL Mismatch
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: `.env` had `RAZOR_BASE_URL=` but `razor_client.py` reads `os.getenv("RAZOR_API_URL", "")`. The variable was never read, Razor integration silently non-functional even if URL was configured.
- **Files Affected**: `.env`
- **Fix Applied**: Changed `.env` key from `RAZOR_BASE_URL` to `RAZOR_API_URL`

---

### BUG-13: Wrong API Path on Exceptions Page (AI Match)
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: Exceptions page called `/bid-rounds/${id}/ai-match` but the actual route is `/rounds/${id}/ai-match`
- **Files Affected**: `frontend/app/admin/rounds/[id]/exceptions/page.tsx`
- **Fix Applied**: Corrected path prefix from `/bid-rounds/` to `/rounds/`

---

### BUG-14: Wrong API Path on New Round Page (Buyer List)
- **Status**: [FIXED]
- **Severity**: Major
- **Description**: New round page called `GET /buyers` to fetch buyer list, but the route is `GET /auth/buyers`
- **Files Affected**: `frontend/app/admin/rounds/new/page.tsx`
- **Fix Applied**: Changed `/buyers` to `/auth/buyers`

---

### BUG-15: _run_processing Has No Error Handling
- **Status**: [FIXED]
- **Severity**: Critical
- **Description**: `_run_processing()` background task had no try/except. Any exception (bad data, DB error, AI error) left the round stuck in `status = "processing"` permanently with no way to recover except a direct DB update.
- **Files Affected**: `backend/app/api/routes/bid_rounds.py` — `_run_processing()`
- **Fix Applied**:
  ```python
  try:
      # ... all processing logic ...
      r.status = "complete"
  except Exception as e:
      _log.error(f"Processing failed for round {bid_round_id}: {e}", exc_info=True)
      r.status = "error"
      db.commit()
      raise
  ```

---

### BUG-16: Missing email-validator Dependency
- **Status**: [FIXED]
- **Severity**: Critical (startup blocker)
- **Description**: Backend Docker container crashed on startup with `ImportError: email-validator is not installed`. A model or schema was using `EmailStr` from pydantic which requires the `email-validator` package.
- **Files Affected**: `backend/requirements.txt`
- **Fix Applied**: Added `email-validator==2.1.0` to requirements.txt, rebuilt Docker image

---

### BUG-17: Demo Seed — passlib/bcrypt Version Incompatibility
- **Status**: [FIXED]
- **Severity**: Major (seed script blocker)
- **Description**: `seed_demo.py` used `passlib.CryptContext` to hash passwords. Inside Docker container (bcrypt newer version), passlib raised: `ValueError: password cannot be longer than 72 bytes`. Root cause: bcrypt 4.x removed `__about__` attribute that passlib checks.
- **Fix Applied**: Changed to direct `import bcrypt; bcrypt.hashpw(...)` bypassing passlib entirely

---

### BUG-18: Demo Seed — Notification Column name is 'read' not 'is_read'
- **Status**: [FIXED]
- **Severity**: Minor (seed script error)
- **Description**: `seed_demo.py` tried to INSERT into `notifications(is_read, ...)` but schema uses `read` column name.
- **Fix Applied**: Changed `is_read` → `read`, added required `recipient_role='admin'` column

---

### BUG-19: Demo Excel Files — Headers on Wrong Row
- **Status**: [FIXED]
- **Severity**: Major (file upload blocker)
- **Description**: `make_demo_files.py` originally put branding in rows 1-2, column headers in row 3, data from row 4. Pandas reads row 0 (Excel row 1) as the header. File parser got "ThinkTLS Bid Desk — Buyer Submission" as the column name, never finding "Part Number" → error "Could not find a part number column"
- **Fix Applied**: Redesigned to put column headers on row 1 (Excel row 1 = pandas default header), data from row 2. Removed decorative branding rows.

---

## Open Bugs (Not Yet Fixed)

See PENDING_TASKS.md sections P1-3, P2-1 through P2-6 for details.

| ID | Description | Priority |
|----|-------------|----------|
| OPEN-01 | SENDGRID_WEBHOOK_KEY uses os.getenv instead of settings | P1 |
| OPEN-02 | Dead code in submit_bid (master_index never used) | P2 |
| OPEN-03 | last_win_date uses bid submitted_at, not deal approved_at | P2 |
| OPEN-04 | my_rounds N+3 queries per round | P2 |
| OPEN-05 | AI matcher only searches 20 master items (cap too low) | P2 |
| OPEN-06 | Razor retry blocks thread (time.sleep in sync context) | P2 |
| OPEN-07 | _safe_int coerces qty=0 to 1 silently | P2 |
