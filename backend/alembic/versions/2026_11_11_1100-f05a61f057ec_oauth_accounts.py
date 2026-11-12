"""oauth_accounts: link provider identities (42, GitHub) to users (bonus B1)

Revision ID: f05a61f057ec
Revises: b5d4e7a2c910
Create Date: 2026-11-10 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f05a61f057ec"
down_revision: Union[str, None] = "b5d4e7a2c910"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copy of the provider value set (DESIGN.md §4).
PROVIDERS = ("42", "github")


def upgrade() -> None:
    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_user_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        # One local account per provider identity ...
        sa.UniqueConstraint("provider", "provider_user_id", name="uq_oauth_accounts_provider_user"),
        # ... and at most one identity per provider per local account.
        sa.UniqueConstraint("user_id", "provider", name="uq_oauth_accounts_user_provider"),
        sa.CheckConstraint(
            "provider IN (" + ", ".join(f"'{p}'" for p in PROVIDERS) + ")",
            name="ck_oauth_accounts_provider",
        ),
    )


def downgrade() -> None:
    op.drop_table("oauth_accounts")
