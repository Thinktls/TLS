"""Add extra_columns JSON to master_items and bid_lines.

Both tables gain a nullable JSONB column to store columns from the original
upload file that are not part of the standard part_number/description/price
schema — e.g. CPU Type, Memory Size, Health Status, Grading Notes from
ThinkTLS laptop and server inventory files.

Without this, the template generator produces a stripped 7-column template
and every buyer who downloads and re-submits it loses all hardware-spec data.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "master_items",
        sa.Column("extra_columns", sa.JSON(), nullable=True),
    )
    op.add_column(
        "bid_lines",
        sa.Column("extra_columns", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bid_lines", "extra_columns")
    op.drop_column("master_items", "extra_columns")
