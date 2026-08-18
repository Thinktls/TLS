# ThinkTLS Bid Desk

A B2B reverse‑auction platform for IT hardware. ThinkTLS runs sealed‑bid rounds where invited
resellers price a master inventory list; the system matches every bid back to the catalogue, picks
the winners, and hands finance a clean set of deals and ERP‑ready exports.

It replaces a manual, spreadsheet‑and‑email workflow: instead of reconciling dozens of buyer
workbooks by hand, an admin uploads one master file, buyers submit their prices, and the platform
does the matching, winner selection, and paperwork.

---

## What it does

- **Round lifecycle** — create a bid round from a master inventory file (Excel/CSV/PDF), invite
  buyers, collect bids, process, and close.
- **Flexible bid ingestion** — buyers upload their own workbook *or* price online in the browser.
  The parser copes with real‑world files: merged cells, title blocks, pivot tables, per‑unit serial
  sheets, and non‑standard column names. It consolidates thousands of unit rows into one line per
  model while preserving each device's serial/UID for the final ERP output.
- **Matching** — three tiers: exact, fuzzy (rapidfuzz), and an optional AI fallback for the awkward
  part numbers the first two miss.
- **Winner selection** — highest valid bid wins, with reserve prices and per‑buyer "loss notice"
  pricing so losing buyers see a competitive number without exposing the real winning price.
- **Deals & approvals** — winners become deals an admin reviews and approves; approved deals export
  to the Razor ERP.
- **Exports** — per‑buyer award sheets, a side‑by‑side bid‑comparison "bid tab", and a Razor upload
  file (one row per physical device: model, serial, UID, price).
- **Buyer portal** — buyers submit bids, review what was parsed, and see their own results.
- **Admin console** — rounds, buyers, invites, analytics, and a natural‑language query tool over the
  round data.
- **Email** — invitations and results notifications, sent through a pluggable provider (SendGrid or
  an SMTP relay).

## Architecture

| Layer | Stack |
|-------|-------|
| API | FastAPI, SQLAlchemy 2, Alembic, Python 3 |
| Database | PostgreSQL |
| Web app | Next.js (App Router), React, TypeScript |
| Landing site | Vite + React (static marketing page) |
| Background jobs | APScheduler (auto‑close rounds, buyer pruning, stuck‑round recovery) |
| AI | Any OpenAI‑compatible endpoint or Anthropic (used only for fallback matching / NL query) |
| ERP | Razor (HTTP) |
| Local dev | Docker Compose (db + api + web) |

## Repository layout

```
backend/            FastAPI service
  app/
    api/routes/     HTTP endpoints (auth, rounds, buyers, deals, exports, …)
    services/       Business logic (parsing, matching, winners, exports, email)
    models/         SQLAlchemy models
    db/             Session, seed data
  alembic/          Database migrations
  tests/            Pytest suite
frontend/           Next.js buyer portal + admin console
  app/              Routes (admin/…, portal/…, login)
  components/       Shared UI
  lib/              API client, helpers
landing/            Static marketing landing page (Vite)
docker-compose.yml  Local stack (Postgres, API, web)
render.yaml.example Deployment/env template — copy to render.yaml and fill in
```

## Getting started (local)

Requires Docker and Docker Compose.

```bash
git clone <repo-url>
cd thinktls-bid-desk
docker compose up -d --build
```

This starts Postgres, the API (`localhost:8000`), and the web app (`localhost:3000`). On first boot
the database migrates and seeds demo data.

Seed the demo dataset (or reset it) at any time:

```bash
docker compose exec backend python -m app.db.seed --force
```

Demo logins (local only): `admin@thinktls.com` / `changeme123`, and `buyer1@acmecorp.com … buyer5`
/ `buyer123`.

Run the backend tests:

```bash
docker compose exec backend python -m pytest
```

## Configuration

All configuration is via environment variables — nothing sensitive is committed. Copy
`render.yaml.example` to `render.yaml` (git‑ignored) or set the variables directly in your host's
dashboard. The main groups are:

- **Database** — `DATABASE_URL`
- **Auth** — `SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- **Email** — `EMAIL_PROVIDER` (`sendgrid` or `relay`) plus the matching keys; `REPLY_TO_EMAIL`
- **AI (optional)** — `ANTHROPIC_API_KEY` *or* `OLLAMA_BASE_URL` + `OLLAMA_API_KEY`
- **ERP (optional)** — `RAZOR_API_URL`, `RAZOR_API_KEY`

## Deployment

The API runs as a container (see `backend/Dockerfile`) and the web app deploys as a standard Next.js
app. Database migrations run automatically on boot. Point the web app at the API with
`NEXT_PUBLIC_API_URL`.

---

© ThinkTLS. Proprietary — all rights reserved.
