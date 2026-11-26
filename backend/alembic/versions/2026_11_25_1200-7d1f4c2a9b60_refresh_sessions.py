"""one refresh-token family per signed-in device

- refresh_tokens.session_id groups the tokens one device rotates through; user_id is no longer
  unique (a second sign-in used to replace the first device's token).
- refresh_tokens.token_hash is unique: it is how a token is looked up.
Existing rows become one session each, so nobody is signed out.

Revision ID: 7d1f4c2a9b60
Revises: 3c8e2b7f9a41
Create Date: 2026-11-25 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7d1f4c2a9b60"
down_revision: Union[str, None] = "3c8e2b7f9a41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("session_id", postgresql.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
    )
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("uq_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    # The old schema holds one token per user: keep the newest.
    op.execute(
        "DELETE FROM refresh_tokens r USING refresh_tokens newer "
        "WHERE newer.user_id = r.user_id AND newer.id > r.id"
    )
    op.drop_index("uq_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=True)
    op.drop_column("refresh_tokens", "session_id")
