"""add auto_approve_enabled to bid_rounds

Opt-in per-round automation (default false): auto-approve deals on a clean round after
processing. Defaults false so existing rounds and the default flow are unchanged and no
buyer emails are ever sent without an explicit opt-in.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-23
"""
import logging
from alembic import op
import sqlalchemy as sa

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None

_log = logging.getLogger("alembic.runtime.migration")


def upgrade():
    # Defensive: the app runs `alembic upgrade head` on boot, so a hiccup here must not take the
    # API down. Add the column if it isn't already present.
    try:
        op.add_column(
            "bid_rounds",
            sa.Column("auto_approve_enabled", sa.Boolean(), nullable=False, server_default="false"),
        )
    except Exception as exc:
        _log.warning("Could not add bid_rounds.auto_approve_enabled (%s) — may already exist.", exc)


def downgrade():
    try:
        op.drop_column("bid_rounds", "auto_approve_enabled")
    except Exception as exc:
        _log.warning("Could not drop bid_rounds.auto_approve_enabled: %s", exc)
