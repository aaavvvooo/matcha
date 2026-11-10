"""Query parameters and results for GET /profiles/browse and /profiles/search (DESIGN.md §5, §8)."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from application.schema.profile_schemas import PhotoResponse
from application.schema.value_sets import Gender, Orientation

SortBy = Literal["score", "age", "distance", "fame", "tags"]
SortOrder = Literal["asc", "desc"]

MAX_TAG_FILTERS = 20


class DiscoveryQuery(BaseModel):
    sort_by: SortBy = "score"
    # None => the natural direction for sort_by (score/fame/tags desc, age/distance asc).
    order: Optional[SortOrder] = None
    min_age: Optional[int] = Field(None, ge=18, le=120)
    max_age: Optional[int] = Field(None, ge=18, le=120)
    max_distance_km: Optional[float] = Field(None, gt=0, le=20000)
    min_fame: Optional[float] = Field(None, ge=0, le=100)
    max_fame: Optional[float] = Field(None, ge=0, le=100)
    # Comma-separated tag names, matched case-insensitively; a candidate needs any one of them.
    tags: Optional[str] = Field(None, max_length=1000)
    limit: int = Field(20, ge=1, le=50)
    offset: int = Field(0, ge=0, le=1000)

    @field_validator("tags")
    @classmethod
    def _no_nul(cls, v):
        if v is not None and "\x00" in v:
            raise ValueError("Invalid character")
        return v

    @model_validator(mode="after")
    def _ranges(self):
        if self.min_age is not None and self.max_age is not None and self.min_age > self.max_age:
            raise ValueError("min_age must not exceed max_age")
        if self.min_fame is not None and self.max_fame is not None and self.min_fame > self.max_fame:
            raise ValueError("min_fame must not exceed max_fame")
        if len(self.tag_names) > MAX_TAG_FILTERS:
            raise ValueError(f"At most {MAX_TAG_FILTERS} tags")
        return self

    @property
    def tag_names(self) -> list[str]:
        if not self.tags:
            return []
        names = (t.strip().lstrip("#").lower() for t in self.tags.split(","))
        return list(dict.fromkeys(n for n in names if n))


class SearchQuery(DiscoveryQuery):
    # City or area; geocoded and used instead of the viewer's own position.
    location: Optional[str] = Field(None, min_length=1, max_length=255)

    @field_validator("location")
    @classmethod
    def _location_no_nul(cls, v):
        if v is None:
            return v
        if "\x00" in v:
            raise ValueError("Invalid character")
        v = v.strip()
        if not v:
            raise ValueError("Location must not be blank")
        return v


MAP_MAX_RESULTS = 200


class MapQuery(BaseModel):
    """Viewport box for GET /profiles/map. Ordering (min < max) is checked in the service (400)."""

    min_lat: float = Field(..., ge=-90, le=90)
    max_lat: float = Field(..., ge=-90, le=90)
    min_lng: float = Field(..., ge=-180, le=180)
    max_lng: float = Field(..., ge=-180, le=180)
    limit: int = Field(MAP_MAX_RESULTS, ge=1, le=MAP_MAX_RESULTS)


class MapUser(BaseModel):
    """A user on the map. latitude/longitude are grid-cell centres, never true coordinates."""

    user_id: int
    username: str
    first_name: str
    age: Optional[int] = None
    fame_rating: float = 0.0
    is_online: bool = False
    photo_url: Optional[str] = None
    latitude: float
    longitude: float
    shared_tags: int = 0


class DiscoveryProfile(BaseModel):
    user_id: int
    username: str
    first_name: str
    last_name: str
    age: Optional[int] = None
    gender: Gender
    sexual_orientation: Optional[Orientation] = None
    bio: Optional[str] = None
    fame_rating: float = 0.0
    is_online: bool = False
    last_seen: Optional[datetime] = None
    location_label: Optional[str] = None
    distance_km: Optional[float] = None
    shared_tags: int = 0
    tags: list[str] = Field(default_factory=list)
    photos: list[PhotoResponse] = Field(default_factory=list)
    score: float = 0.0
