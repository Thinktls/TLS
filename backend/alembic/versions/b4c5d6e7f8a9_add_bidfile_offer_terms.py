"""add offer_terms to bid_files

Free-text conditions a buyer attaches to their offer (e.g. "won't accept an award under $20K",
"all SSDs must be >90% health"). Nullable; existing submissions are unaffected.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-30
"""
import logging
from alembic import op
import sqlalchemy as sa

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None

_log = logging.getLogger("alembic.runtime.migration")


def upgrade():
    # Defensive: the app runs `alembic upgrade head` on boot, so a hiccup here must not take the
    # API down. Add the column only if it isn't already present.
    try:
        op.add_column("bid_files", sa.Column("offer_terms", sa.Text(), nullable=True))
    except Exception as exc:
        _log.warning("Could not add bid_files.offer_terms (%s) — may already exist.", exc)

    # Inline ("Enter Prices Online") submissions have no uploaded file, so file_path is legitimately
    # NULL. The original schema declared it NOT NULL, which would 500 an inline submit. Relax it.
    try:
        op.alter_column("bid_files", "file_path", existing_type=sa.String(), nullable=True)
    except Exception as exc:
        _log.warning("Could not relax bid_files.file_path nullability: %s", exc)


def downgrade():
    try:
        op.drop_column("bid_files", "offer_terms")
    except Exception as exc:
        _log.warning("Could not drop bid_files.offer_terms: %s", exc)
