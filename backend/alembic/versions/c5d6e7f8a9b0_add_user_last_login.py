"""add last_login to users

Tracks the last successful login so admins can see who has actually accepted their invite and
signed in (vs. invited-but-never-logged-in). Nullable; existing users start with NULL = never.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-08-11
"""
import logging
from alembic import op
import sqlalchemy as sa

revision = "c5d6e7f8a9b0"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None

_log = logging.getLogger("alembic.runtime.migration")


def upgrade():
    try:
        op.add_column("users", sa.Column("last_login", sa.DateTime(timezone=True), nullable=True))
    except Exception as exc:
        _log.warning("Could not add users.last_login (%s) — may already exist.", exc)


def downgrade():
    try:
        op.drop_column("users", "last_login")
    except Exception as exc:
        _log.warning("Could not drop users.last_login: %s", exc)
