"""add round_buyers scorer fields ai match approval overrides

Revision ID: a1b2c3d4e5f6
Revises: f406ea662c6c
Create Date: 2026-05-12 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = 'f406ea662c6c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # round_buyers junction table
    op.create_table(
        'round_buyers',
        sa.Column('round_id', sa.Integer(), sa.ForeignKey('bid_rounds.id'), primary_key=True),
        sa.Column('buyer_id', sa.Integer(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('invited_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('invite_status', sa.String(), nullable=True),
    )

    # Buyer scorer fields on users
    op.add_column('users', sa.Column('fluff_enabled', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('users', sa.Column('last_invited_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_win_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('win_rate', sa.Float(), nullable=True, server_default='0'))
    op.add_column('users', sa.Column('total_lines_won', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('users', sa.Column('total_lines_bid', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('users', sa.Column('total_margin_contribution', sa.Float(), nullable=True, server_default='0'))
    op.add_column('users', sa.Column('score_updated_at', sa.DateTime(timezone=True), nullable=True))

    # customer field on bid_rounds
    op.add_column('bid_rounds', sa.Column('customer', sa.String(), nullable=True))

    # AI match fields on bid_lines
    op.add_column('bid_lines', sa.Column('ai_match_suggestion', sa.String(), nullable=True))
    op.add_column('bid_lines', sa.Column('ai_match_confidence', sa.Float(), nullable=True))
    op.add_column('bid_lines', sa.Column('anomaly_reason', sa.String(), nullable=True))

    # Approval overrides table
    op.create_table(
        'approval_overrides',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('deal_id', sa.Integer(), sa.ForeignKey('deals.id'), nullable=False),
        sa.Column('bid_round_id', sa.Integer(), sa.ForeignKey('bid_rounds.id'), nullable=False),
        sa.Column('admin_user', sa.String(), nullable=False),
        sa.Column('field_changed', sa.String(), nullable=False),
        sa.Column('old_value', sa.String(), nullable=True),
        sa.Column('new_value', sa.String(), nullable=True),
        sa.Column('reason_note', sa.Text(), nullable=False),
        sa.Column('overridden_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('approval_overrides')
    op.drop_column('bid_lines', 'anomaly_reason')
    op.drop_column('bid_lines', 'ai_match_confidence')
    op.drop_column('bid_lines', 'ai_match_suggestion')
    op.drop_column('bid_rounds', 'customer')
    op.drop_column('users', 'score_updated_at')
    op.drop_column('users', 'total_margin_contribution')
    op.drop_column('users', 'total_lines_bid')
    op.drop_column('users', 'total_lines_won')
    op.drop_column('users', 'win_rate')
    op.drop_column('users', 'last_win_date')
    op.drop_column('users', 'last_invited_date')
    op.drop_column('users', 'fluff_enabled')
    op.drop_table('round_buyers')
