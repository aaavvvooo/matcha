"""Request / response models for date scheduling (DESIGN.md §5, EPICS B5)."""

import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from application.schema.fields import DbId
from application.schema.value_sets import DateStatus

# Keep in sync with the dates table column widths and frontend/src/api/datesApi.js.
MAX_TITLE_LENGTH = 100
MAX_PLACE_LENGTH = 200
MAX_NOTE_LENGTH = 500
# A date can be planned at most this far ahead.
MAX_ADVANCE = timedelta(days=366)


# Bidirectional controls (embeddings/overrides/isolates) and the Unicode line/paragraph separators
# let a title visually reorder or break the surrounding UI ("trojan source" style spoofing).
_BIDI_AND_SEPARATORS = frozenset(
    {chr(c) for c in range(0x202A, 0x202F)} | {chr(c) for c in range(0x2066, 0x206A)} | {"\u2028", "\u2029"}
)


def _has_unsafe_chars(text: str, allow: str = "") -> bool:
    """True for text Postgres can't store or that has no place in a label: NUL and other control
    characters (except those in `allow`), bidi controls, U+2028/2029, and lone surrogates."""
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return True
    return any(
        ch in _BIDI_AND_SEPARATORS or (unicodedata.category(ch) == "Cc" and ch not in allow)
        for ch in text
    )


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
        if _has_unsafe_chars(value):
            raise ValueError("contains characters that are not allowed")
        return value

    @field_validator("note")
    @classmethod
    def _note_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if _has_unsafe_chars(value, allow="\n"):
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

