"""Request / response models for date scheduling (DESIGN.md §5, EPICS B5)."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from application.schema.fields import DbId, has_unsafe_chars
from application.schema.value_sets import DateStatus

# Keep in sync with the dates table column widths and frontend/src/api/datesApi.js.
MAX_TITLE_LENGTH = 100
MAX_PLACE_LENGTH = 200
MAX_NOTE_LENGTH = 500
# A date can be planned at most this far ahead.
MAX_ADVANCE = timedelta(days=366)


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TITLE_LENGTH)]
Place = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_PLACE_LENGTH)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_NOTE_LENGTH)]


class DateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invitee_id: DbId
    title: Title
    place: Place
    scheduled_at: datetime
    note: Optional[Note] = None

    @field_validator("title", "place")
    @classmethod
    def _single_line(cls, value: str) -> str:
        if has_unsafe_chars(value):
            raise ValueError("contains characters that are not allowed")
        return value

    @field_validator("note")
    @classmethod
    def _note_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if has_unsafe_chars(value, allow="\n"):
            raise ValueError("contains characters that are not allowed")
        return value or None

    @field_validator("scheduled_at")
    @classmethod
    def _future_instant(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("must include a timezone (use an ISO 8601 UTC instant)")
        value = value.astimezone(timezone.utc)
        now = datetime.now(timezone.utc)
        if value <= now:
            raise ValueError("must be in the future")
        if value > now + MAX_ADVANCE:
            raise ValueError("cannot be more than a year ahead")
        return value


class DatePartner(BaseModel):
    """The other participant of a date, as the viewer sees them."""

    id: int
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    photo_url: Optional[str] = None


class DateResponse(BaseModel):
    id: int
    proposer_id: int
    invitee_id: int
    title: str
    place: str
    note: Optional[str] = None
    scheduled_at: datetime
    status: DateStatus
    created_at: datetime
    updated_at: datetime
    with_user: DatePartner

