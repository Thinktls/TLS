# PROJECT FOLDER STRUCTURE
## ThinkTLS Bid Desk

```
thinktls-bid-desk/
│
├── .env                          # Real env (git-ignored) — DB, API keys, secrets
├── .env.example                  # Template env — safe to commit
├── docker-compose.yml            # 3 services: db (PostgreSQL), backend, frontend
│
├── PROJECT_MASTER_MEMORY_EXPORT.md   ← THIS EXPORT
├── PROJECT_QUICK_START.md
├── PROJECT_FOLDER_STRUCTURE.md
├── PENDING_TASKS.md
├── KNOWN_BUGS_AND_FIXES.md
├── API_AND_ENV_SETUP.md
├── FULL_WORKFLOW_DOCUMENTATION.md
│
├── backend/
│   ├── Dockerfile                # Python 3.11-slim, copies app, runs entrypoint.sh
│   ├── entrypoint.sh             # alembic upgrade head → uvicorn main:app
│   ├── main.py                   # FastAPI app, CORS, router mounting, lifespan scheduler
│   ├── requirements.txt          # Python dependencies
│   ├── alembic.ini               # Alembic config (reads DATABASE_URL from env)
│   ├── pytest.ini                # Test config
│   ├── seed_demo.py              # Demo data seeder (4 rounds, 5 buyers, 20 deals)
│   ├── make_demo_files.py        # Generate demo Excel bid files for presentations
│   │
│   ├── alembic/
│   │   ├── env.py                # Alembic env setup (imports all models)
│   │   └── versions/
│   │       ├── f406ea662c6c_initial_schema.py          # Base tables
│   │       ├── a1b2c3d4e5f6_add_round_buyers_scorer_fields.py  # M2M + scoring
│   │       ├── b2c3d4e5f6a7_add_invite_tokens.py       # Token table
│   │       ├── c3d4e5f6a7b8_add_notifications.py       # Notifications
│   │       └── d4e5f6a7b8c9_add_performance_indexes.py # DB indexes
│   │
│   └── app/
│       ├── __init__.py
│       │
│       ├── core/
│       │   ├── config.py         # pydantic-settings, all env vars, lru_cache singleton
│       │   └── security.py       # JWT encode/decode, bcrypt hash/verify, role guards
│       │
│       ├── db/
│       │   ├── base.py           # SQLAlchemy Base = declarative_base()
│       │   ├── session.py        # SessionLocal factory, get_db dependency
│       │   └── seed.py           # (legacy) initial admin seed
│       │
│       ├── models/               # SQLAlchemy ORM models
│       │   ├── user.py           # User (admin + buyer), scoring fields
│       │   ├── bid_round.py      # BidRound + round_buyers M2M junction Table
│       │   ├── master_item.py    # Master catalog items per round
│       │   ├── bid_file.py       # Uploaded bid files
│       │   ├── bid_line.py       # Individual priced line items
│       │   ├── deal.py           # Approved deals
│       │   ├── notification.py   # Admin notification feed
│       │   ├── approval_override.py  # Audit log for deal field changes
│       │   └── invite_token.py   # One-time tokens (setup + reset)
│       │
│       ├── schemas/
│       │   └── auth.py           # Pydantic schemas: LoginRequest, TokenResponse, UserCreate, UserOut
│       │
│       ├── api/
│       │   └── routes/
│       │       ├── __init__.py
│       │       ├── auth.py           # /api/auth/* — login, buyers, invite, reset
│       │       ├── bid_rounds.py     # /api/rounds/* — round lifecycle, exports, analytics
│       │       ├── buyer.py          # /api/buyer/* — buyer portal routes
│       │       ├── deals.py          # /api/deals/* — approval, override, Razor push
│       │       ├── exceptions.py     # /api/exceptions/* — exception queue
│       │       ├── notifications.py  # /api/notifications/* — feed + create_notification()
│       │       ├── nlquery.py        # /api/query/ — NL → SQL via Claude
│       │       └── inbound_email.py  # /api/inbound-email/ — SendGrid webhook
│       │
│       └── services/             # Business logic layer
│           ├── file_parser.py        # Parse Excel/CSV → list of dicts
│           ├── normalizer.py         # normalize_part_number(), normalize_description()
│           ├── matcher.py            # 3-tier matching engine (exact/fuzzy/AI)
│           ├── ai_matcher.py         # Claude API batch matching for exceptions
│           ├── winner_selector.py    # Winner selection + fluff engine
│           ├── buyer_scorer.py       # Recalculate buyer composite score
│           ├── export_service.py     # All export formats (xlsx, csv, zip)
│           ├── template_generator.py # Protected Excel template for buyers
│           ├── email_service.py      # SendGrid integration (_send utility)
│           ├── razor_client.py       # Razor ERP push with retry
│           └── scheduler.py          # APScheduler: 90-day auto-prune at 02:00 UTC
│
└── frontend/
    ├── Dockerfile                # node:20-alpine, npm install, next build, next start
    ├── package.json              # next 16.2.6, react 19.2.4, axios, recharts, lucide
    ├── tsconfig.json             # TypeScript config, path alias @/* → ./
    ├── postcss.config.mjs        # Tailwind v4 postcss config
    ├── eslint.config.mjs         # ESLint 9 flat config
    ├── CLAUDE.md                 # Points to AGENTS.md
    ├── AGENTS.md                 # Next.js breaking-changes warning
    │
    ├── public/                   # Static assets
    │   └── *.svg                 # Icons (file, globe, vercel, window)
    │
    ├── app/                      # Next.js App Router
    │   ├── layout.tsx            # Root layout: ErrorBoundary wrapper
    │   ├── page.tsx              # / → redirect based on localStorage role
    │   ├── globals.css           # Tailwind base + custom global styles
    │   ├── favicon.ico
    │   │
    │   ├── login/page.tsx        # Login form (glassmorphism dark)
    │   ├── setup-password/page.tsx   # Initial password setup (token)
    │   ├── forgot-password/page.tsx  # Forgot password form
    │   ├── reset-password/page.tsx   # Reset password form (token)
    │   │
    │   ├── admin/
    │   │   ├── page.tsx          # Dashboard: KPI cards + charts + top buyers
    │   │   ├── guide/page.tsx    # Admin user guide
    │   │   ├── query/page.tsx    # NL Query interface
    │   │   ├── reports/page.tsx  # Global analytics + monthly deal value chart
    │   │   │
    │   │   ├── rounds/
    │   │   │   ├── page.tsx      # Rounds list table
    │   │   │   ├── new/page.tsx  # Create round + assign buyers
    │   │   │   └── [id]/
    │   │   │       ├── page.tsx          # Round detail (bid files, status)
    │   │   │       ├── exceptions/page.tsx   # Exception review queue
    │   │   │       ├── deals/page.tsx        # Deal approval + override
    │   │   │       ├── comparison/page.tsx   # Price comparison matrix
    │   │   │       ├── analytics/page.tsx    # Round analytics
    │   │   │       ├── participation/page.tsx # Participation tracker
    │   │   │       └── export/page.tsx       # Export hub
    │   │   │
    │   │   └── buyers/
    │   │       ├── page.tsx      # Buyers list
    │   │       ├── compare/page.tsx   # Side-by-side comparison
    │   │       ├── fluff/page.tsx     # Fluff % management
    │   │       └── [id]/page.tsx      # Buyer scorecard detail
    │   │
    │   └── portal/
    │       ├── page.tsx          # Buyer dashboard
    │       ├── bid/page.tsx      # Upload bid file
    │       └── results/page.tsx  # Won/lost results view
    │
    ├── components/
    │   ├── AdminLayout.tsx       # Sidebar + notification bell + top bar
    │   ├── BuyerLayout.tsx       # Buyer portal layout + nav
    │   └── ErrorBoundary.tsx     # React class error boundary
    │
    └── lib/
        ├── api.ts                # Axios instance: baseURL, auth interceptor, 401 redirect
        ├── auth.ts               # localStorage auth: saveAuth, getRole, logout, etc.
        └── download.ts           # Authenticated blob file download helper
```

---

## Key Dependency Relationships

```
main.py
  └── imports all 8 routers
  └── imports scheduler (start/stop in lifespan)

Each router imports:
  ├── app.db.session → get_db (SQLAlchemy session per request)
  ├── app.core.security → require_admin / require_buyer / get_current_user
  ├── app.models.* → ORM models
  └── app.services.* → business logic

Services import each other:
  bid_rounds.py → file_parser, matcher, winner_selector, export_service, email_service
  winner_selector.py → buyer_scorer (implicit via deals.py approve)
  deals.py → buyer_scorer, razor_client, notifications
  matcher.py → (standalone)
  ai_matcher.py → matcher (called from bid_rounds._run_processing)

Frontend lib dependencies:
  All pages → lib/api.ts (axios with auth)
  Admin pages → components/AdminLayout.tsx
  Buyer pages → components/BuyerLayout.tsx
  Download buttons → lib/download.ts
```
