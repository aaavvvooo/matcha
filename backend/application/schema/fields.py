"""Reusable constrained field types and the one shared rule for user-supplied text.

Every request field that carries user text goes through `has_unsafe_chars` (directly or via the
annotated types below), so NUL / control characters / lone surrogates never reach Postgres (they
would be a 500) and labels can't carry bidi or zero-width spoofing characters.
"""

import re
import unicodedata
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import Path
from pydantic import AfterValidator, EmailStr, Field, StringConstraints

# Bidirectional controls (embeddings/overrides/isolates) and the Unicode line/paragraph separators
# let a label visually reorder or break the surrounding UI ("trojan source" style spoofing).
_BIDI_AND_SEPARATORS = frozenset(
    {chr(c) for c in range(0x202A, 0x202F)} | {chr(c) for c in range(0x2066, 0x206A)} | {" ", " "}
)
# Extra categories refused in identity fields (names, usernames): format characters (zero-width
# space/joiners, BOM, soft hyphen, ...), private-use and unassigned code points.
_IDENTITY_EXTRA_CATEGORIES = frozenset({"Cf", "Co", "Cn"})


def has_unsafe_chars(text: str, allow: str = "", identity: bool = False) -> bool:
    """True for text Postgres can't store or that has no place in user-facing text: lone
    surrogates, NUL and other control characters (except those in `allow`), bidi controls and
    U+2028/2029. With identity=True also format/zero-width, private-use and unassigned characters.
    """
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return True
    for ch in text:
        if ch in _BIDI_AND_SEPARATORS:
            return True
        category = unicodedata.category(ch)
        if category == "Cc" and ch not in allow:
            return True
        if identity and category in _IDENTITY_EXTRA_CATEGORIES:
            return True
    return False


def _check(allow: str = "", identity: bool = False):
    def validator(value: str) -> str:
        if has_unsafe_chars(value, allow=allow, identity=identity):
            raise ValueError("contains characters that are not allowed")
        return value

    return validator


# Annotated metadata: `Annotated[str, StringConstraints(...), SafeText]`.
SafeText = AfterValidator(_check())                        # one line: titles, places, cities, search
SafeMultiline = AfterValidator(_check(allow="\n\r\t"))     # bio, notes, chat (newlines/tabs allowed)
SafeIdentity = AfterValidator(_check(identity=True))       # names: also no zero-width / format chars

# Login / forgot-password identifier: a username or an email address (≤ 254 by RFC 5321).
LoginIdentifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254), SafeText]


# Matches users.first_name / users.last_name VARCHAR(50).
PersonName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=50),
    SafeIdentity,
]

# One username rule for register, profile update and the OAuth generator. ASCII only, so it can
# never look like an email address (no "@") or carry look-alike / invisible characters.
# Uniqueness is case-insensitive (uq_users_username_lower). Checked on write only: existing
# accounts with older usernames can still sign in.
USERNAME_PATTERN = r"^[A-Za-z0-9_.-]{3,30}$"
USERNAME_RE = re.compile(USERNAME_PATTERN)


def _check_username(value: str) -> str:
    if not USERNAME_RE.fullmatch(value):
        raise ValueError("username must be 3-30 characters: letters, digits, dot, dash or underscore")
    return value


Username = Annotated[str, StringConstraints(max_length=30), AfterValidator(_check_username)]

# Stored and compared lower-case (uq_users_email_lower).
Email = Annotated[EmailStr, AfterValidator(lambda v: v.lower())]

# A password is hashed, never stored, but a lone surrogate would still crash the hasher.
Password = Annotated[str, StringConstraints(min_length=8, max_length=128), AfterValidator(_check(allow="\t"))]

# Postgres INTEGER ids: out-of-range values would otherwise reach asyncpg and 500.
INT4_MAX = 2_147_483_647
DbId = Annotated[int, Field(ge=1, le=INT4_MAX)]
PathId = Annotated[int, Path(ge=1, le=INT4_MAX)]

MIN_AGE = 18
MAX_AGE = 120


def _age_on(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def check_birth_date(value: Optional[datetime]) -> Optional[datetime]:
    """A real date in the past giving an age between MIN_AGE and MAX_AGE (inclusive)."""
    if value is None:
        return None
    born = value.astimezone(timezone.utc).date() if value.tzinfo else value.date()
    today = datetime.now(timezone.utc).date()
    if born >= today:
        raise ValueError("must be in the past")
    age = _age_on(born, today)
    if age < MIN_AGE:
        raise ValueError(f"you must be at least {MIN_AGE} years old")
    if age > MAX_AGE:
        raise ValueError(f"must be at most {MAX_AGE} years ago")
    return value


BirthDate = Annotated[datetime, AfterValidator(check_birth_date)]
