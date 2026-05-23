"""add_week4_indexes

Additional composite indexes for Week 4 performance targets:
  bid_lines (bid_round_id, buyer_id)   — buyer-scoped round queries
  bid_lines (bid_round_id, is_winner)  — winner export path
  bid_lines (master_item_id)           — winner-selection group-by
  master_items (bid_round_id, part_number_normalized) — Tier-1 exact lookup

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-22
"""
from alembic import op

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_bid_lines_round_buyer_id',   'bid_lines',    ['bid_round_id', 'buyer_id'],              unique=False)
    op.create_index('ix_bid_lines_round_winner',     'bid_lines',    ['bid_round_id', 'is_winner'],             unique=False)
    op.create_index('ix_bid_lines_master_item_id',   'bid_lines',    ['master_item_id'],                        unique=False)
    op.create_index('ix_master_items_round_pn_norm', 'master_items', ['bid_round_id', 'part_number_normalized'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_master_items_round_pn_norm', table_name='master_items')
    op.drop_index('ix_bid_lines_master_item_id',   table_name='bid_lines')
    op.drop_index('ix_bid_lines_round_winner',     table_name='bid_lines')
    op.drop_index('ix_bid_lines_round_buyer_id',   table_name='bid_lines')
