"""add auto_send_invites to bid_rounds

Opt-in per-round automation (default false): automatically send bid invitations to
round buyers when a round opens. Defaults false so existing rounds and the default
flow are unchanged.

Revision ID: a4b5c6d7e8f9
Revises: c5d6e7f8a9b0
Create Date: 2026-08-21
"""
import logging
from alembic import op
import sqlalchemy as sa

revision = "a4b5c6d7e8f9"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None

_log = logging.getLogger("alembic.runtime.migration")


def upgrade():
    # Defensive: the app runs `alembic upgrade head` on boot, so a hiccup here must not take the
    # API down. Add the column if it isn't already present.
    try:
        op.add_column(
            "bid_rounds",
            sa.Column("auto_send_invites", sa.Boolean(), nullable=False, server_default="false"),
        )
    except Exception as exc:
        _log.warning("Could not add bid_rounds.auto_send_invites (%s) - may already exist.", exc)


def downgrade():
    try:
        op.drop_column("bid_rounds", "auto_send_invites")
    except Exception as exc:
        _log.warning("Could not drop bid_rounds.auto_send_invites: %s", exc)
