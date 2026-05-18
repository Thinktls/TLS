# PROJECT QUICK START
## ThinkTLS Bid Desk — Get Running in 5 Minutes

---

## Prerequisites
- Docker Desktop installed and running
- Git
- Node.js 20+ (for frontend local dev only)
- Python 3.11+ (for backend local dev only)

---

## Option A — Docker (Recommended, Fastest)

```bash
# 1. Clone the repo
git clone <repo-url> thinktls-bid-desk
cd thinktls-bid-desk

# 2. Copy env file
cp .env.example .env
# Edit .env — set SECRET_KEY, optionally API keys

# 3. Start everything
docker-compose up -d

# 4. Wait ~15 seconds for DB to be healthy, then check
curl http://localhost:8000/health
# → {"status":"ok","service":"ThinkTLS Bid Desk"}

# 5. Seed demo data (optional but recommended)
docker exec -e DATABASE_URL=postgresql://thinktls:changeme@db:5432/thinktls_bid_desk \
  thinktls-bid-desk-backend-1 python /app/seed_demo.py

# 6. Open the app
open http://localhost:3000
```

**Login**: admin@thinktls.com / changeme123

---

## Option B — Local Dev (Hot Reload)

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Make sure PostgreSQL is running (use Docker just for DB)
docker-compose up -d db

export DATABASE_URL=postgresql://thinktls:changeme@localhost:5432/thinktls_bid_desk
export SECRET_KEY=dev-secret-key-change-me

alembic upgrade head          # Run migrations
python seed_demo.py           # (optional) seed demo data
uvicorn main:app --reload     # Start with hot reload on :8000
```

### Frontend
```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

npm run dev    # Start on :3000
```

---

## Rebuild After Code Changes

```bash
# Backend only
docker-compose build backend && docker-compose up -d backend

# Frontend only
docker-compose build frontend && docker-compose up -d frontend

# Both
docker-compose build && docker-compose up -d
```

---

## Common Commands

```bash
# View logs
docker logs -f thinktls-bid-desk-backend-1
docker logs -f thinktls-bid-desk-frontend-1

# Run migrations
docker exec thinktls-bid-desk-backend-1 alembic upgrade head

# Open PostgreSQL shell
docker exec -it thinktls-bid-desk-db-1 psql -U thinktls -d thinktls_bid_desk

# Reset and re-seed all demo data
docker exec -e DATABASE_URL=postgresql://thinktls:changeme@db:5432/thinktls_bid_desk \
  thinktls-bid-desk-backend-1 python /app/seed_demo.py

# Generate demo Excel bid files
docker exec thinktls-bid-desk-backend-1 python /app/make_demo_files.py
docker cp thinktls-bid-desk-backend-1:/tmp/thinktls_demo_files ./demo_files

# Stop everything
docker-compose down

# Stop and wipe database volume (full reset)
docker-compose down -v
```

---

## Key URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |
| ReDoc | http://localhost:8000/redoc |

---

## Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@thinktls.com | changeme123 |
| Buyer 1 | buyer1@acme.com | buyer123 |
| Buyer 2 | buyer2@techco.com | buyer123 |
| Buyer 3 | buyer3@globalit.com | buyer123 |
| Buyer 4 | buyer4@premier.com | buyer123 |
| Buyer 5 | buyer5@nextech.com | buyer123 |

---

## Environment Variables You Must Set for Full Functionality

| Variable | What It Enables |
|----------|----------------|
| `ANTHROPIC_API_KEY` | AI part matching + NL Query |
| `SENDGRID_API_KEY` | Email invitations + password reset |
| `RAZOR_API_URL` + `RAZOR_API_KEY` | ERP deal push |
| `FRONTEND_URL` | Correct links in emails |
| `SECRET_KEY` | JWT signing (CHANGE THIS IN PRODUCTION) |
