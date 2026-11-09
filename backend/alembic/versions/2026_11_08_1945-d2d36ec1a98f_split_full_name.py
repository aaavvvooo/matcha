"""split users.full_name into first_name + last_name

The subject requires first and last name as separate fields. Backfill splits
on the first whitespace run; single-word names keep an empty last name.

Revision ID: d2d36ec1a98f
Revises: 696c82f8eec6
Create Date: 2026-11-08 19:45:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2d36ec1a98f"
down_revision: Union[str, None] = "696c82f8eec6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(length=50), nullable=True))
    op.execute(
        r"""
        UPDATE users SET
            first_name = left(COALESCE(NULLIF(substring(btrim(COALESCE(full_name, '')) FROM '^\S+'), ''), username), 50),
            last_name  = left(btrim(regexp_replace(btrim(COALESCE(full_name, '')), '^\S+\s*', '')), 50)
        """
    )
    op.alter_column("users", "first_name", nullable=False)
    op.alter_column("users", "last_name", nullable=False, server_default="")
    op.drop_column("users", "full_name")


def downgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(), nullable=True))
    op.execute("UPDATE users SET full_name = btrim(first_name || ' ' || last_name)")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
