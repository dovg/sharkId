"""add_validated_processing_status

Revision ID: 073fb80f9ea2
Revises: e562f204216c
Create Date: 2026-02-24 10:43:59.672978+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '073fb80f9ea2'
down_revision: Union[str, None] = 'e562f204216c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE processing_status_enum ADD VALUE IF NOT EXISTS 'validated'")


def downgrade() -> None:
    # PostgreSQL does not support removing individual enum values.
    # Rolling back would require recreating the type — out of scope for MVP.
    pass
