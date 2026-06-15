"""add_users_email_index

Index on users.email — the login query does a filter by email on every
request. Without this index every login is a full table scan.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-06-15
"""
from alembic import op

revision = "c0d1e2f3a4b5"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_users_email", "users", ["email"], unique=True, if_not_exists=True)


def downgrade():
    op.drop_index("ix_users_email", table_name="users")
