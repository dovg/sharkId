"""add_user_role

Revision ID: f1a2b3c4d5e6
Revises: bcc81e5a65eb
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'bcc81e5a65eb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(20), nullable=False, server_default='editor'))


def downgrade() -> None:
    op.drop_column('users', 'role')
