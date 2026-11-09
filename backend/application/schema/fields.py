"""Reusable constrained field types."""

from typing import Annotated

from fastapi import Path
from pydantic import Field, StringConstraints

# Matches users.first_name / users.last_name VARCHAR(50).
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]

# Postgres INTEGER ids: out-of-range values would otherwise reach asyncpg and 500.
INT4_MAX = 2_147_483_647
DbId = Annotated[int, Field(ge=1, le=INT4_MAX)]
PathId = Annotated[int, Path(ge=1, le=INT4_MAX)]
