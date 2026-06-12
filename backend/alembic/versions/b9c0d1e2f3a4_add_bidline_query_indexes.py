"""add_bidline_query_indexes

Adds indexes on bid_lines columns that are frequently filtered in participation
queries, winner lookups, and match-status reports.

Revision ID: a1b2c3d4e5f6
Revises: f7a8b9c0d1e2
Create Date: 2026-06-12
"""
from alembic import op

revision = "b9c0d1e2f3a4"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_bid_lines_buyer_id",     "bid_lines", ["buyer_id"],     if_not_exists=True)
    op.create_index("ix_bid_lines_match_status",  "bid_lines", ["match_status"], if_not_exists=True)
    op.create_index("ix_bid_lines_is_winner",     "bid_lines", ["is_winner"],    if_not_exists=True)
    op.create_index("ix_bid_lines_bid_round_buyer", "bid_lines", ["bid_round_id", "buyer_id"], if_not_exists=True)


def downgrade():
    op.drop_index("ix_bid_lines_bid_round_buyer", table_name="bid_lines")
    op.drop_index("ix_bid_lines_is_winner",       table_name="bid_lines")
    op.drop_index("ix_bid_lines_match_status",    table_name="bid_lines")
    op.drop_index("ix_bid_lines_buyer_id",        table_name="bid_lines")
