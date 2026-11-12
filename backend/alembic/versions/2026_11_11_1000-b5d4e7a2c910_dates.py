"""dates: date proposals between connected users, plus date_* notification types

Revision ID: b5d4e7a2c910
Revises: a7c3e91b5d20
Create Date: 2026-11-11 10:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b5d4e7a2c910"
down_revision: Union[str, None] = "a7c3e91b5d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies: a migration must not change if the app's value sets do later.
OLD_NOTIFICATION_TYPES = ("like", "view", "message", "match", "unlike")
DATE_NOTIFICATION_TYPES = (
    "date_proposed", "date_accepted", "date_declined", "date_cancelled", "date_reminder",
)
NEW_NOTIFICATION_TYPES = OLD_NOTIFICATION_TYPES + DATE_NOTIFICATION_TYPES
DATE_STATUSES = ("pending", "accepted", "declined", "cancelled")


def _in_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    # All timestamps are timestamptz; the API reads and writes them as UTC instants.
    op.create_table(
        "dates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("proposer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invitee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("place", sa.String(length=200), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("proposer_id <> invitee_id", name="ck_dates_distinct_users"),
        sa.CheckConstraint(f"status IN ({_in_list(DATE_STATUSES)})", name="ck_dates_status"),
    )
    # Listing by either participant, ordered by time.
    op.create_index("ix_dates_proposer", "dates", ["proposer_id", "scheduled_at"])
    op.create_index("ix_dates_invitee", "dates", ["invitee_id", "scheduled_at"])
    # The reminder loop only ever looks at accepted dates that have not been reminded yet.
    op.create_index(
        "ix_dates_reminder",
        "dates",
        ["scheduled_at"],
        postgresql_where=sa.text("status = 'accepted' AND reminder_sent_at IS NULL"),
    )

    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type", "notifications", f"type IN ({_in_list(NEW_NOTIFICATION_TYPES)})"
    )


def downgrade() -> None:
    # Rows with the new types would violate the restored constraint.
    op.execute(f"DELETE FROM notifications WHERE type IN ({_in_list(DATE_NOTIFICATION_TYPES)})")
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_type", "notifications", f"type IN ({_in_list(OLD_NOTIFICATION_TYPES)})"
    )
    op.drop_index("ix_dates_reminder", table_name="dates")
    op.drop_index("ix_dates_invitee", table_name="dates")
    op.drop_index("ix_dates_proposer", table_name="dates")
    op.drop_table("dates")
