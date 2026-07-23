"""add unit_details to master_items

Consolidated-by-model items keep the per-device Serial/UID list here so the final per-winner
Razor output can expand a won model into one line per device. Nullable, default null — existing
rows and non-unit rounds are unaffected.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-07-23
"""
import logging
from alembic import op
import sqlalchemy as sa

revision = "a3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None

_log = logging.getLogger("alembic.runtime.migration")


def upgrade():
    # `json` (not jsonb) so ordering/shape round-trips verbatim, and defensive so a boot-time
    # upgrade can't take the API down.
    try:
        op.add_column("master_items", sa.Column("unit_details", sa.JSON(), nullable=True))
    except Exception as exc:
        _log.warning("Could not add master_items.unit_details (%s) — may already exist.", exc)


def downgrade():
    try:
        op.drop_column("master_items", "unit_details")
    except Exception as exc:
        _log.warning("Could not drop master_items.unit_details: %s", exc)
