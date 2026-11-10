"""indexes for chat conversation, history and unread queries

Revision ID: a7c3e91b5d20
Revises: d2d36ec1a98f
Create Date: 2026-11-10 12:00:00
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a7c3e91b5d20"
down_revision: Union[str, None] = "d2d36ec1a98f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Latest message / history of one direction of a pair (both directions are queried).
    op.create_index("ix_messages_pair", "messages", ["sender_id", "receiver_id", "id"], unique=False)
    # Unread counts per recipient and sender; tiny because only unread rows are indexed.
    op.create_index(
        "ix_messages_unread",
        "messages",
        ["receiver_id", "sender_id"],
        unique=False,
        postgresql_where="is_read = false",
    )


def downgrade() -> None:
    op.drop_index("ix_messages_unread", table_name="messages")
    op.drop_index("ix_messages_pair", table_name="messages")
