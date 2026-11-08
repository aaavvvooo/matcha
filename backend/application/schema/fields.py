"""Reusable constrained field types."""

from typing import Annotated

from pydantic import StringConstraints

# Matches users.first_name / users.last_name VARCHAR(50).
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
