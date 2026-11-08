"""Closed value sets shared by schemas, DB CHECK constraints and matching (DESIGN.md §4)."""

from typing import Literal, get_args

Gender = Literal["Man", "Woman", "Non-binary", "Other"]
Orientation = Literal["Heterosexual", "Homosexual", "Bisexual", "Other"]
NotificationType = Literal["like", "view", "message", "match", "unlike"]

GENDERS: tuple[str, ...] = get_args(Gender)
ORIENTATIONS: tuple[str, ...] = get_args(Orientation)
NOTIFICATION_TYPES: tuple[str, ...] = get_args(NotificationType)
