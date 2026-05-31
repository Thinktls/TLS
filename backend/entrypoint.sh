#!/bin/sh
set -e

echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head

echo "[entrypoint] Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
