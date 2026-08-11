#!/bin/sh
set -e

echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head

# One-shot production reset via env flag — for Render plans without Shell access.
# Set RESET_CREATE_ADMIN=1 and NEW_ADMIN_PASSWORD=... in the Environment tab, then redeploy.
# SAFETY: it only runs while no brokers@thinktls.com admin exists. Once the reset has created that
# admin, every future boot skips it even if the flag is left set — so a forgotten flag can never
# re-wipe live data. (Remove the flag afterward regardless.)
if [ -n "$RESET_CREATE_ADMIN" ]; then
  echo "[entrypoint] RESET_CREATE_ADMIN is set — evaluating one-shot reset..."
  if python -c "
import sys
sys.path.insert(0, '/app')
from app.db.session import SessionLocal
from app.models.user import User
db = SessionLocal()
exists = db.query(User).filter(User.email == 'brokers@thinktls.com').first() is not None
db.close()
sys.exit(0 if exists else 1)
"; then
    echo "[entrypoint] brokers@thinktls.com already exists — reset already done, skipping."
  else
    echo "[entrypoint] No brokers admin yet — running one-shot reset (clears all test data)..."
    python -m scripts.reset_and_create_admin --yes-i-am-sure || echo "[entrypoint] Reset did not complete — check that NEW_ADMIN_PASSWORD is set."
  fi
fi

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
# --timeout-keep-alive 120: allow large file uploads up to 2 min without disconnect
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --timeout-keep-alive 120
