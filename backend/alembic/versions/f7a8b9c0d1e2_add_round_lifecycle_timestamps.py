"""add_round_lifecycle_timestamps

Adds 5 nullable DateTime columns to bid_rounds to record when each
lifecycle action was performed by the admin.

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "f7a8b9c0d1e2"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("bid_rounds", sa.Column("master_file_uploaded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bid_rounds", sa.Column("opened_at",              sa.DateTime(timezone=True), nullable=True))
    op.add_column("bid_rounds", sa.Column("closed_at",              sa.DateTime(timezone=True), nullable=True))
    op.add_column("bid_rounds", sa.Column("processing_started_at",  sa.DateTime(timezone=True), nullable=True))
    op.add_column("bid_rounds", sa.Column("completed_at",           sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("bid_rounds", "completed_at")
    op.drop_column("bid_rounds", "processing_started_at")
    op.drop_column("bid_rounds", "closed_at")
    op.drop_column("bid_rounds", "opened_at")
    op.drop_column("bid_rounds", "master_file_uploaded_at")
