"""security hardening: id-keyed sessions, token version, pending email, case-insensitive uniqueness

- refresh_tokens is keyed by users.id (FK, ON DELETE CASCADE) instead of the mutable username.
  Existing rows are matched to their user by username; rows whose user no longer exists are
  dropped. (Tokens minted before this revision carry sub=<username> and are rejected by the app
  anyway, so everyone signs in again.)
- users.token_version: bumped on password reset; access/refresh JWTs carry it ("ver") and are
  rejected once it moves on, which ends every outstanding session.
- verification_tokens.new_email: the address a pending email change will switch to once its
  token is confirmed (NULL for sign-up verification and password-reset tokens).
- unique indexes on lower(email) and lower(username). If existing rows already differ only by
  letter case the upgrade stops with a clear message and changes nothing (one transaction).

Revision ID: 3c8e2b7f9a41
Revises: f05a61f057ec
Create Date: 2026-11-12 10:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "3c8e2b7f9a41"
down_revision: Union[str, None] = "f05a61f057ec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _refuse_case_collisions(column: str) -> None:
    """Abort (before any change is committed) if two users share `column` ignoring case."""
    rows = op.get_bind().execute(
        sa.text(
            f"SELECT array_agg(id ORDER BY id) AS ids FROM users "  # column is one of two literals
            f"GROUP BY lower({column}) HAVING count(*) > 1"
        )
    ).fetchall()
    if rows:
        groups = "; ".join(", ".join(str(i) for i in row.ids) for row in rows[:20])
        raise RuntimeError(
            f"Cannot add the case-insensitive unique index on users.{column}: "
            f"{len(rows)} group(s) of accounts differ only by letter case (user ids: {groups}"
            f"{' ...' if len(rows) > 20 else ''}). Rename or remove the duplicates, then run "
            f"`alembic upgrade head` again. Nothing was changed."
        )


def upgrade() -> None:
    _refuse_case_collisions("email")
    _refuse_case_collisions("username")
    op.create_index("uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True)
    op.create_index("uq_users_username_lower", "users", [sa.text("lower(username)")], unique=True)

    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.add_column("verification_tokens", sa.Column("new_email", sa.String(), nullable=True))
    op.create_index(
        "ix_verification_tokens_user_type", "verification_tokens", ["user_id", "token_type", "created_at"]
    )

    op.add_column("refresh_tokens", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE refresh_tokens r SET user_id = u.id FROM users u WHERE u.username = r.username"
    )
    op.execute("DELETE FROM refresh_tokens WHERE user_id IS NULL")
    op.alter_column("refresh_tokens", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_refresh_tokens_user_id", "refresh_tokens", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=True)
    op.drop_index("ix_refresh_tokens_username", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "username")


def downgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("username", sa.String(), nullable=True))
    op.execute(
        "UPDATE refresh_tokens r SET username = u.username FROM users u WHERE u.id = r.user_id"
    )
    op.execute("DELETE FROM refresh_tokens WHERE username IS NULL")
    op.alter_column("refresh_tokens", "username", nullable=False)
    op.create_index("ix_refresh_tokens_username", "refresh_tokens", ["username"], unique=True)
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_constraint("fk_refresh_tokens_user_id", "refresh_tokens", type_="foreignkey")
    op.drop_column("refresh_tokens", "user_id")

    op.drop_index("ix_verification_tokens_user_type", table_name="verification_tokens")
    op.drop_column("verification_tokens", "new_email")

    op.drop_column("users", "token_version")

    op.drop_index("uq_users_username_lower", table_name="users")
    op.drop_index("uq_users_email_lower", table_name="users")
