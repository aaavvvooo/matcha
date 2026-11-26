"""oauth_accounts: 42 is the only provider (GitHub sign-in removed)

Existing GitHub links are deleted; those users keep their account and can set a
password through "forgot password".

Revision ID: a42b0c1d2e3f
Revises: 7d1f4c2a9b60
Create Date: 2026-11-26 12:00:00
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a42b0c1d2e3f"
down_revision: Union[str, None] = "7d1f4c2a9b60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "ck_oauth_accounts_provider"


def upgrade() -> None:
    op.execute("DELETE FROM oauth_accounts WHERE provider <> '42'")
    op.drop_constraint(CONSTRAINT, "oauth_accounts", type_="check")
    op.create_check_constraint(CONSTRAINT, "oauth_accounts", "provider IN ('42')")


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, "oauth_accounts", type_="check")
    op.create_check_constraint(CONSTRAINT, "oauth_accounts", "provider IN ('42', 'github')")
