"""profile value set checks

Normalise legacy gender / orientation / notification values, then enforce the
DESIGN.md §4 value sets with CHECK constraints.

Revision ID: 696c82f8eec6
Revises: a1b2c3d4e5f6
Create Date: 2026-11-08 19:30:00
"""
from typing import Sequence, Union

from alembic import op

revision: str = "696c82f8eec6"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies: a migration must not change if the app's value sets do later.
GENDERS = ("Man", "Woman", "Non-binary", "Other")
ORIENTATIONS = ("Heterosexual", "Homosexual", "Bisexual", "Other")
NOTIFICATION_TYPES = ("like", "view", "message", "match", "unlike")


def _in_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    # Unknown gender => incomplete profile (hidden until fixed); unknown
    # orientation => NULL, which matching treats as Bisexual.
    op.execute(f"UPDATE user_profiles SET gender = NULL WHERE gender NOT IN ({_in_list(GENDERS)})")
    op.execute(
        "UPDATE user_profiles SET sexual_orientation = NULL "
        f"WHERE sexual_orientation NOT IN ({_in_list(ORIENTATIONS)})"
    )
    op.execute(f"DELETE FROM notifications WHERE type NOT IN ({_in_list(NOTIFICATION_TYPES)})")

    op.create_check_constraint(
        "ck_user_profiles_gender", "user_profiles", f"gender IN ({_in_list(GENDERS)})"
    )
    op.create_check_constraint(
        "ck_user_profiles_sexual_orientation",
        "user_profiles",
        f"sexual_orientation IN ({_in_list(ORIENTATIONS)})",
    )
    op.create_check_constraint(
        "ck_notifications_type", "notifications", f"type IN ({_in_list(NOTIFICATION_TYPES)})"
    )


def downgrade() -> None:
    op.drop_constraint("ck_notifications_type", "notifications", type_="check")
    op.drop_constraint("ck_user_profiles_sexual_orientation", "user_profiles", type_="check")
    op.drop_constraint("ck_user_profiles_gender", "user_profiles", type_="check")
