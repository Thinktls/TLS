#!/bin/sh
set -e

echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head

echo "[entrypoint] Checking if seed is needed..."
python -c "
import sys, os
sys.path.insert(0, '/app')
from app.db.session import SessionLocal
from app.models.user import User
db = SessionLocal()
admin = db.query(User).filter(User.role=='admin').first()
db.close()
if not admin:
    print('[entrypoint] No admin found — running seed...')
    import subprocess
    result = subprocess.run(['python', '-m', 'app.db.seed'], capture_output=False)
    sys.exit(result.returncode)
else:
    print('[entrypoint] Admin exists — skipping seed.')
"

echo "[entrypoint] Starting uvicorn on port ${PORT:-8000}..."
# --limit-concurrency: no cap on concurrent requests
# --timeout-keep-alive 120: allow large file uploads up to 2 min without disconnect
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --timeout-keep-alive 120 \
  --limit-max-requests 0
