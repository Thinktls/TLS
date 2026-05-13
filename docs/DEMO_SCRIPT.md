# ThinkTLS Bid Desk — 25-Minute Demo Script
> Audience: Joe and Troy · Presenter: [your name]

---

## Pre-Demo Checklist (10 min before)
- [ ] Backend running: `cd backend && uvicorn main:app --reload`
- [ ] Frontend running: `cd frontend && npm run dev`
- [ ] Logged in as admin at http://localhost:3000/login
- [ ] Sample master file ready: `docs/samples/master_sample.xlsx` (500 rows)
- [ ] Two buyer accounts created: buyer1@demo.com, buyer2@demo.com
- [ ] Browser at http://localhost:3000/admin — full screen, dark mode

---

## Section 1 — Platform Overview (3 min)

**Say:** "This is the ThinkTLS Bid Desk — a full-cycle bid management platform built for your IT resale operation. Everything happens here, from sending bid templates to buyers, all the way to pushing approved deals into Razor ERP."

**Show:**
1. Admin dashboard — KPI cards (deal value, active buyers, unbid rate)
2. Sidebar navigation — walk through each section briefly

---

## Section 2 — Creating a Bid Round (3 min)

**Say:** "Every procurement event starts with a Bid Round. Let me create one live."

**Show:**
1. Click **Bid Rounds → New Round**
2. Fill in: Name `"Demo Round — Q2 2026"`, Commodity `Servers`, Customer `Acme Corp`
3. Click **Create Round**
4. Upload `master_sample.xlsx` (500 lines) — **highlight the line item count confirmation**

**Talking point:** "The system normalizes every part number automatically — stripping dashes, spaces, and casing differences — so buyers and your master file always match up even if formatting differs."

---

## Section 3 — Assigning Buyers & Sending Invitations (2 min)

**Show:**
1. Click **Assign Buyers** — check buyer1 and buyer2
2. Click **Save Assignment**
3. Click **Send Invitations** — show the confirmation toast "Invitations sent to 2 buyer(s)"
4. Switch to **Buyer Participation** (Live Tracker) — show both buyers in "Invited" state

**Talking point:** "Each buyer gets a secure single-use link. No passwords to manage on their side. The live tracker here refreshes every 30 seconds — you can watch uploads come in during a live round."

---

## Section 4 — Buyer Portal Experience (3 min)

*Open an incognito window and log in as buyer1@demo.com*

**Show:**
1. Buyer portal landing — round listed with deadline
2. Click **Download Bid Template** — show the pre-filled Excel with their assigned part numbers
3. Fill in two prices in the spreadsheet, save
4. Upload the bid file back through the portal
5. Return to admin — participation tracker shows buyer1 as **Uploaded**

**Talking point:** "Buyers see only the template, not each other's prices. The template is generated on-demand with exactly the items in the master file."

---

## Section 5 — Three-Tier Matching Engine (4 min)

*Back in admin. Close round, then run Process Bids.*

**Say:** "When you close and process a round, the matching engine runs three passes."

**Show:**
1. Click **Close Round**
2. Click **Process Bids & Select Winners**
3. While processing (or after): open **Round Summary** — show match counts

**Explain the three tiers:**
- **Exact match** — normalized part number matches directly
- **Fuzzy match** — RapidFuzz at ≥88 confidence auto-accepts; 65–87 gets flagged as exception
- **AI match** — Claude processes unmatched items in batches of 20; ≥85 confidence auto-accepts

**Show:** Exceptions tab → filter by type (unmatched / fuzzy-low / anomaly)

---

## Section 6 — Bid Comparison & Winner Selection (3 min)

**Show:**
1. **Bid Comparison Table** — side-by-side buyer prices per part number, winning price highlighted
2. Scroll through — point out anomalies flagged in red
3. **Round Summary** — winners count, deal value, exception breakdown

**Talking point:** "Winner selection is automatic — highest price wins, reserve price floor is enforced, ties break on earliest upload timestamp. You can override any decision in the approval screen."

---

## Section 7 — Deal Approval & Razor ERP Push (4 min)

**Show:**
1. Open **Approve Deals**
2. Walk through a row: part number, winner, price, total
3. Click **Approve** on one deal — status flips to green "approved"
4. Click **Approve All** — show the count confirmation
5. Click **→ Razor** on an approved deal — show push confirmation

**Talking point:** "Every override is logged — who changed what, when, and why. You get a full audit trail for every deal. Razor integration uses 3× exponential backoff retry so network hiccups don't lose pushes."

---

## Section 8 — Reports & Analytics (3 min)

**Show:**
1. **Reports** page — monthly deal value bar chart, KPI cards, top buyers by margin
2. **Round Analytics** — 4-tab deep dive: Overview / Buyers / Prices / Timeline
3. **Buyer Compare** — all buyers ranked by win rate, deal value, score; rounds heatmap

**Talking point:** "Every buyer gets a composite score — win rate, margin contribution, anomaly count, response time. The heatmap shows at a glance who participates consistently vs. sporadically."

---

## Wrap-Up (1 min)

**Summary bullets (say these out loud):**
- End-to-end in one platform — no spreadsheets flying around
- Three-tier AI matching keeps exceptions under 5% on clean data
- Fluff engine protects your margin on loss notices automatically
- Full audit trail on every deal and override
- Razor ERP push with retry logic already wired in

**Q&A prompt:** "What's the first round you'd want to run through this?"

---

## Backup Demos (if asked)

| Feature | Where |
|---|---|
| Fluff engine settings | Admin → Fluff Settings |
| NL query ("which buyers won the most server deals?") | Admin → AI Query |
| Email bid ingestion | Show inbound_email webhook endpoint in docs |
| Export center | Round → Export Center (deals CSV, comparison XLSX, award sheet) |
| Exception resolution | Round → Review Exceptions → manual match / bulk resolve |
| Forgot password flow | Login → Forgot password? |
