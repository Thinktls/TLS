"""add_performance_indexes

Adds indexes on the high-cardinality filter and join columns that the
matching, winner-selection, and export query paths hit most often.

Initial schema already created:
  ix_master_items_part_number
  ix_master_items_part_number_normalized

This migration adds what is still missing:

  bid_lines
    ix_bid_lines_bid_round_id            — round-scoped filtering (critical)
    ix_bid_lines_normalized_part_number  — Tier-1 exact-match lookup
    ix_bid_lines_buyer_id                — buyer-specific analytics
    ix_bid_lines_round_match_status      — composite for process-round query
      (bid_round_id, match_status)

  master_items
    ix_master_items_bid_round_id         — round-scoped filtering

  bid_files
    ix_bid_files_bid_round_id            — participation / tiebreaker joins
    ix_bid_files_buyer_id                — buyer bid-history queries

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-13
"""
from alembic import op


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # bid_lines — individual column indexes
    op.create_index('ix_bid_lines_bid_round_id',           'bid_lines', ['bid_round_id'],            unique=False)
    op.create_index('ix_bid_lines_normalized_part_number', 'bid_lines', ['normalized_part_number'],  unique=False)
    op.create_index('ix_bid_lines_buyer_id',               'bid_lines', ['buyer_id'],                unique=False)

    # bid_lines — composite index covering the most common processing query:
    # WHERE bid_round_id = :id AND match_status = 'pending'
    op.create_index('ix_bid_lines_round_match_status', 'bid_lines', ['bid_round_id', 'match_status'], unique=False)

    # master_items
    op.create_index('ix_master_items_bid_round_id', 'master_items', ['bid_round_id'], unique=False)

    # bid_files
    op.create_index('ix_bid_files_bid_round_id', 'bid_files', ['bid_round_id'], unique=False)
    op.create_index('ix_bid_files_buyer_id',     'bid_files', ['buyer_id'],     unique=False)


def downgrade() -> None:
    op.drop_index('ix_bid_files_buyer_id',                 table_name='bid_files')
    op.drop_index('ix_bid_files_bid_round_id',             table_name='bid_files')
    op.drop_index('ix_master_items_bid_round_id',          table_name='master_items')
    op.drop_index('ix_bid_lines_round_match_status',       table_name='bid_lines')
    op.drop_index('ix_bid_lines_buyer_id',                 table_name='bid_lines')
    op.drop_index('ix_bid_lines_normalized_part_number',   table_name='bid_lines')
    op.drop_index('ix_bid_lines_bid_round_id',             table_name='bid_lines')
