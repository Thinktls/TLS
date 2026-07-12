# FULL WORKFLOW DOCUMENTATION
## ThinkTLS Bid Desk — Every Workflow, Step by Step

---

## WORKFLOW 1: Admin Creates and Opens a Bid Round

### Trigger
Admin clicks "New Round" in the admin portal.

### Steps
1. **Admin fills form** — name, commodity, customer, deadline, reserve price enabled (Y/N)
2. **Frontend** → `POST /api/rounds/` with `{name, commodity, customer, submission_deadline, reserve_price_enabled}`
3. **Backend** creates `BidRound` with `status="draft"`, returns round object
4. **Admin uploads master file** — Excel/CSV with columns: Part Number, Description, Manufacturer, Quantity, Reserve Price, Category
5. **Frontend** → `POST /api/rounds/{id}/master-file` (multipart form data)
6. **Backend** runs `parse_master_file()`:
   - Detects columns via alias matching (`MASTER_COLUMN_ALIASES`)
   - Normalizes each part number: strips non-alphanumeric, uppercase → `part_number_normalized`
   - Deletes old master items for this round
   - Creates new `MasterItem` rows
   - Sets `round.master_file_uploaded = True`, `round.total_line_items = N`
7. **Admin assigns buyers** → `POST /api/rounds/{id}/buyers` with `{buyer_ids: [1,2,3]}`
8. **Backend** replaces `round_buyers` rows: `{round_id, buyer_id, invite_status="pending"}`
9. **Admin sends invites** → `POST /api/rounds/{id}/invite-buyers`
10. **Backend** sends SendGrid emails to each assigned buyer with template download link
11. **Admin opens round** → `POST /api/rounds/{id}/open`
12. **Backend** sets `status="open"` (validates master file uploaded)

### Edge Cases
- Can't open without master file: 400 error
- Can re-upload master file (clears and replaces all master items)
- Buyers can be changed while round is open

### Database Operations
- INSERT bid_rounds
- DELETE + INSERT master_items
- DELETE + INSERT round_buyers
- UPDATE bid_rounds (status, master_file_uploaded)

---

## WORKFLOW 2: Buyer Submits a Bid

### Trigger
Buyer logs in to portal, selects an assigned open round, uploads their Excel/CSV bid file.

### Steps
1. **Buyer lists assigned rounds** → `GET /api/buyer/rounds`
   - Backend: queries `round_buyers` for this buyer's round IDs, filters `BidRound` by those IDs + `status="open"`
2. **Buyer downloads template** → `GET /api/buyer/rounds/{id}/template`
   - Backend: calls `generate_bid_template(db, round_id)` — returns Excel with master items pre-filled (part numbers, descriptions), price column blank
3. **Buyer fills template** — enters Unit Price and Quantity for each item they're bidding on
4. **Buyer uploads completed template** → `POST /api/buyer/rounds/{id}/bid` (multipart Excel/CSV)
5. **Backend validation**:
   - Round exists and is open? → 404/400 if not
   - Buyer is assigned? → 403 if not (checks `round_buyers`)
   - Deadline passed? → 400 if yes
6. **Backend creates BidFile record** (`status="processing"`)
7. **Backend calls `parse_buyer_file()`**:
   - Detects columns via `BUYER_COLUMN_ALIASES`
   - Returns list of `{raw_part_number, normalized_part_number, unit_price, quantity, ...}`
   - On parse error: sets `bid_file.status = "error"`, returns 400
8. **Backend creates `BidLine` records** for each row
9. **Backend updates**:
   - `bid_file.status = "processed"`
   - `buyer.last_bid_at = now()`
   - `buyer.total_rounds_participated += 1`
   - `round_buyers.invite_status = "uploaded"`
10. **Backend emits notification** to admin feed: "New bid received from [Company]"
11. **Returns**: `{"message": "Submitted N line items", "bid_file_id": id}`

### Edge Cases
- Buyer can re-submit — creates a new BidFile and BidLines (no deduplication at file level)
- Duplicate part numbers in same file → flagged as exception (type: "duplicate")
- Zero/negative prices → parsed as None (excluded from winner selection)
- Quantity 0 → coerced to 1 (known issue)

### Database Operations
- SELECT round_buyers (assignment check)
- INSERT bid_files
- INSERT bid_lines (N rows)
- UPDATE bid_files (status)
- UPDATE users (last_bid_at, total_rounds_participated)
- UPDATE round_buyers (invite_status)
- INSERT notifications

---

## WORKFLOW 3: Admin Processes a Round (Core Matching + Winner Selection)

### Trigger
Admin clicks "Process Round" after deadline or manually.

### Steps
1. **Admin closes round** → `POST /api/rounds/{id}/close` → `status = "closed"`
2. **Admin starts processing** → `POST /api/rounds/{id}/process`
3. **Backend sets** `status = "processing"`, adds `_run_processing` to `BackgroundTasks`
4. **`_run_processing(bid_round_id, db)` runs in background thread**:

   **Phase 1 — Match all bid lines**
   ```
   Load all BidFiles for round
   For each BidFile:
     Load its BidLines (status="pending")
     Load MasterItems for round
     call match_bid_lines(lines, masters)
       For each line:
         Tier 1: exact normalize match → status="matched", method="exact"
         Tier 2: rapidfuzz.token_sort_ratio
           ≥88% → status="matched", method="fuzzy"
           65-87% → status="exception", type="partial_match"
           <65% → status="exception", type="unmatched"
         Duplicate check: same buyer + same normalized PN → type="duplicate"
         Overbid check: bid_qty > master_qty → type="overbid"
     Update BidFile.lines_matched, lines_exception
   ```

   **Phase 2 — AI Matching for Exceptions**
   ```
   IF ANTHROPIC_API_KEY is set:
     Find all "unmatched" and "partial_match" exceptions
     Batch into groups of 20 master items
     For each exception:
       Call Claude claude-sonnet-4-6 with raw_part + description + 20 master candidates
       Claude returns: {match_index, confidence, reason}
       IF confidence >= 88: set match_status="matched", method="ai"
       IF 65 <= confidence < 88: update ai_match_suggestion, keep status="exception"
       IF error: count as still-flagged
   ```

   **Phase 3 — Winner Selection**
   ```
   call select_winners(db, bid_round_id)
   For each master_item_id:
     Collect all matched bid_lines with unit_price NOT NULL
     Anomaly detection (if ≥3 bids):
       Calculate mean + stdev of prices
       z_score = |price - mean| / stdev
       is_anomaly = True if z>2.5 OR price>mean×10 OR price<mean×0.2
     Filter below-reserve: if reserve_price set, mark below-reserve bids as exception
     Sort: highest price first, tiebreak = earliest bid_file.uploaded_at
     winner = first in sorted list
     winner.is_winner = True
     winner.real_winning_price = unit_price
     For each loser:
       IF buyer.fluff_enabled: fluff_pct = buyer.fluff_percentage ELSE 0
       loser.fluffed_loss_price = winner_price × (1 + fluff_pct/100)
     Create Deal(bid_round_id, master_item_id, winning_buyer_id, ...)
   ```

   **Phase 4 — Score Recalculation**
   ```
   call recalculate_buyer_scores(db, bid_round_id)
   For each buyer who participated:
     Count total lines bid, lines won
     win_rate = won/bid
     Sum margin: (winning_price - reserve_price) × qty for won lines
     Find last_win datetime
     Calculate composite score (0-100):
       win_component = win_rate × 45
       activity_component = log1p(lines_bid)/log1p(1000) × 30
       margin_component = log1p(margin)/log1p(100000) × 15
       recency_component = max(0, 10 - days_since_last_win/30)
     UPDATE users SET buyer_score, win_rate, etc.
   ```

   **Phase 5 — Complete**
   ```
   round.status = "complete"
   db.commit()
   ```

   **Error Handling**:
   ```
   On any exception:
     round.status = "error"
     db.commit()
     re-raise (logged)
   ```

### Edge Cases
- Round with no bid lines: completes with 0 deals
- Item with no valid bids: skipped (no deal created)
- All bids below reserve: no deal created for that item
- AI API down: exceptions remain unresolved, processing continues

### Database Operations
- READ all bid_files, bid_lines, master_items for round
- UPDATE bid_lines (match fields, winner fields, fluff fields, anomaly fields)
- INSERT deals
- UPDATE users (buyer scores)
- UPDATE bid_rounds (status)

---

## WORKFLOW 4: Admin Reviews and Resolves Exceptions

### Trigger
After processing, admin reviews exceptions before approving deals.

### Exception Queue
`GET /api/exceptions/rounds/{id}` — filterable by type, resolved status

### Resolution Actions
1. **approve_match** — accept current master item mapping as-is
2. **reject** — mark as rejected (excluded from winner selection)
3. **remap** — manually select a different master item from search
4. **approve_ai** — accept Claude's suggestion (uses `ai_match_suggestion`)

### Bulk Resolution
`POST /api/exceptions/rounds/{id}/bulk-resolve`
- `action: "approve_suggested"` — auto-approve all AI matches with confidence ≥ 85
- `action: "reject_all"` — reject all unresolved exceptions

### After Exception Resolution
- Resolved lines with `status="matched"` can participate in winner selection
- Admin may need to re-run processing if significant exceptions were resolved
- Or: manually approve individual deals from the deals tab

---

## WORKFLOW 5: Admin Approves Deals

### Trigger
Round processing completes, deals appear in pending_approval state.

### Individual Approval
`POST /api/deals/{id}/approve` → sets status="approved", approved_by, approved_at

### Bulk Approval
`POST /api/deals/rounds/{id}/approve-all` → approves all pending_approval deals

### After Approval
- `recalculate_buyer_scores()` called for all buyers in the round
- If `AUTO_PUSH_RAZOR=true`: automatically push each deal to Razor ERP
- Deals appear in buyer's "My Results" and "My Deals" views

### Override Flow
`POST /api/deals/{id}/override`
```json
{
  "field_changed": "unit_price|quantity|winning_buyer",
  "new_value": "745.00",
  "reason_note": "Mandatory explanation"
}
```
- Every override is logged to `approval_overrides` table
- Audit trail accessible at `GET /api/deals/{id}/overrides`
- Deal must be re-approved after override

---

## WORKFLOW 6: Buyer Views Results

### Trigger
Round is complete, buyer logs into portal.

### Steps
1. **Buyer → My Results** → `GET /api/buyer/my-results`
2. Backend returns all matched bid_lines for this buyer:
   - Won: `{outcome:"WON", your_price: X, winning_price: X}` (same price)
   - Lost: `{outcome:"LOST", your_price: X, winning_price: fluffed_loss_price}` ← NEVER the real price
3. **Buyer → My Results for Round** → `GET /api/buyer/my-results/{round_id}` (same logic, scoped)
4. **Buyer downloads award sheet** → `GET /api/buyer/rounds/{id}/award-sheet`
   - Returns Excel with won + lost lines, fluffed prices for losses
5. **Buyer → My Deals** → `GET /api/buyer/my-deals`
   - Returns all approved `Deal` records where `winning_buyer_id = buyer.id`

### Security Note
- Buyer portal NEVER exposes `real_winning_price` from bid_lines
- Buyer NEVER sees other buyers' prices
- Only admin can see real prices via deals + comparison endpoints

---

## WORKFLOW 7: Razor ERP Push

### Trigger
Admin clicks "Push to Razor" on a deal or "Push All to Razor" for a round.

### Steps
1. Admin → `POST /api/deals/{id}/push-razor`
2. Backend validates deal `status == "approved"`
3. Calls `push_deal_to_razor(db, deal)`:
   ```
   Build payload: {externalId, partNumber, description, quantity, unitPrice, ...}
   Attempt 1: POST to RAZOR_API_URL/deals
   On failure: sleep(2), try again
   Attempt 2: POST to RAZOR_API_URL/deals  
   On failure: sleep(4), try again
   Attempt 3: POST to RAZOR_API_URL/deals
   On final failure: razor_push_status="failed", emit notification, raise RazorPushError
   On success: razor_deal_id=response.id, razor_push_status="success", status="pushed_to_razor"
   ```
4. On `RazorPushError`: returns `{"status":"razor_failed", "fallback": "/export/razor.csv"}`
5. Admin downloads Razor-format CSV as fallback

### If Razor URL Not Configured
- `RAZOR_API_URL = ""` → `RazorPushError("RAZOR_API_URL not configured")` immediately
- CSV export always available as fallback

---

## WORKFLOW 8: Password Setup (New Buyer)

### Trigger
Admin creates buyer account and sends invite email.

### Steps
1. **Admin creates buyer** → `POST /api/auth/buyers` `{email, full_name, company_name, ...}`
2. **Admin sends invite** → `POST /api/auth/buyers/{id}/send-invite`
3. **Backend**:
   - Invalidates any existing unused tokens for this buyer
   - Creates `InviteToken` with 72-hour TTL
   - Sends email: "Welcome to ThinkTLS Bid Desk" with setup link
   - Link: `{FRONTEND_URL}/setup-password?token={token}`
4. **Buyer clicks email link** → opens `/setup-password?token=...`
5. **Frontend validates token** → `GET /api/auth/invite/validate?token=...`
   - Returns: buyer name, email, expiry
6. **Buyer enters password** → `POST /api/auth/setup-password` `{token, new_password}`
7. **Backend**:
   - Validates token (not used, not expired)
   - Password must be ≥ 8 characters
   - Sets `user.hashed_password`, `user.is_active = True`
   - Marks token as `used = True`
   - Returns JWT (buyer is logged in immediately)

---

## WORKFLOW 9: Password Reset

### Trigger
Buyer clicks "Forgot Password" on login page.

### Steps
1. **Buyer enters email** → `POST /api/auth/forgot-password` `{email}`
2. **Backend**:
   - If email exists + active: creates InviteToken with 2-hour TTL, sends reset email
   - Always returns 200 (prevents email enumeration)
3. **Buyer clicks reset link** → `/reset-password?token=...`
4. **Buyer enters new password** → `POST /api/auth/reset-password` `{token, new_password}`
5. **Backend**: validates token, sets new password, marks token used

---

## WORKFLOW 10: Natural Language Query

### Trigger
Admin types question in AI Query page.

### Steps
1. **Admin types**: "Which buyers won the most laptop deals in Q1 2026?"
2. **Frontend** → `POST /api/query/` `{question: "..."}`
3. **Backend** calls `_translate_to_sql()`:
   - Uses `AsyncAnthropic` client (non-blocking)
   - Sends schema context + question to Claude claude-sonnet-4-6
   - Claude returns raw SQL (no markdown)
4. **Backend validates**: SQL must start with SELECT
5. **Backend executes** SQL with `db.execute(text(sql))`
6. **Returns**: `{question, sql, columns, rows (max 500), truncated}`
7. **Frontend** displays results table + the generated SQL

### Schema Context Sent to Claude
```
Tables:
- users(id, email, full_name, role, company_name, fluff_percentage, buyer_score, last_bid_at)
- bid_rounds(id, name, commodity, status, submission_deadline, total_line_items, created_at)
- master_items(id, bid_round_id, part_number, description, manufacturer, quantity, reserve_price, category)
- bid_files(id, bid_round_id, buyer_id, filename, status, lines_parsed, lines_matched, uploaded_at)
- bid_lines(id, bid_round_id, buyer_id, master_item_id, raw_part_number, unit_price, quantity, match_method, match_status, exception_type, is_winner, real_winning_price, fluffed_loss_price, is_anomaly, z_score)
- deals(id, bid_round_id, master_item_id, winning_buyer_id, part_number, quantity, winning_price, total_value, status, razor_push_status)
```

---

## WORKFLOW 11: Inbound Email Bid Submission

### Trigger
Buyer emails bid file to a configured SendGrid inbound parse address.

### Steps
1. Buyer emails `bids@thinktls.com` with bid Excel file attached
2. SendGrid receives, parses, POSTs to `POST /api/inbound-email/`
3. **Backend**:
   - Verifies SENDGRID_WEBHOOK_KEY header (currently: NEEDS FIX)
   - Extracts sender email → looks up buyer
   - Extracts subject → parses round ID (e.g., "Round 5" or "Round #5")
   - Extracts first Excel/CSV attachment
   - Calls `parse_buyer_file()` on attachment bytes
   - Creates BidFile + BidLines same as web submission
   - Updates `invite_status = "uploaded"`
   - Emits admin notification

### Edge Cases
- Unknown sender email → 400 error (no processing)
- No attachment → 400 error
- No round ID in subject → 400 error
- Round not open → 400 error

---

## WORKFLOW 12: 90-Day Auto-Prune (Scheduled)

### Trigger
APScheduler cron job, fires at 02:00 UTC every day.

### Steps
1. `_prune_inactive_buyers()` called by APScheduler
2. Opens new DB session
3. Queries: `users WHERE role="buyer" AND is_active=True AND last_bid_at < (now - 90 days)`
4. Sets each `buyer.is_active = False`
5. Commits, closes session
6. Logs count of deactivated buyers

### Notes
- Buyers with `last_bid_at = NULL` are NOT pruned (never bid → keep)
- Pruned buyers can be re-activated by admin (`PATCH /auth/buyers/{id}/toggle`)
- Scheduler starts/stops with FastAPI lifespan (starts on app startup, stops on shutdown)

---

## WORKFLOW 13: Export Downloads (All Formats)

All exports require admin auth. Frontend uses `downloadFile()` from `lib/download.ts` which sends Bearer token via axios.

| Export | Endpoint | Content |
|--------|----------|---------|
| Deals Excel | `/rounds/{id}/export/deals.xlsx` | Deal summary with buyer info |
| Deals CSV | `/rounds/{id}/export/deals.csv` | Same, CSV format |
| Bid Comparison | `/rounds/{id}/export/comparison.xlsx` | Matrix: items × buyers with prices |
| Award Sheet (1 buyer) | `/rounds/{id}/export/award-sheet/{buyer_id}` | That buyer's wins + losses |
| All Award Sheets | `/rounds/{id}/export/award-sheets.zip` | ZIP of all buyer award sheets |
| Razor CSV | `/rounds/{id}/export/razor.csv` | Razor ERP format fallback |
| Margin Report | `/rounds/{id}/export/margin-report.xlsx` | Price vs reserve analysis |
| Disposition Report | `/rounds/{id}/export/disposition.xlsx` | Full item-by-item breakdown |
| Buyer Award Sheet | `/buyer/rounds/{id}/award-sheet` | Buyer's own results (fluffed) |

All return `StreamingResponse` with appropriate `Content-Disposition: attachment` header.
