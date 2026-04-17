""" add is_online and last_seen to users

Revision ID: a1b2c3d4e5f6
Revises: 447011dacd74
Create Date: 2026-04-17 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '447011dacd74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_online', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'last_seen')
    op.drop_column('users', 'is_online')
