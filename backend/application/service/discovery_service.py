import logging
import math
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, status

from application.clients import geocoding_client as geocoding
from application.database import Database
from application.repository.discovery_repo import DiscoveryRepository
from application.schema.discovery_schemas import DiscoveryProfile, DiscoveryQuery, MapQuery, MapUser, SearchQuery
from application.schema.profile_schemas import PhotoResponse
from application.utils.photo_url import to_photo_url

logger = logging.getLogger(__name__)


class DiscoveryService:
    def __init__(self, db: Database):
        self.repo = DiscoveryRepository(db)

    async def browse(self, viewer_id: int, q: DiscoveryQuery) -> list[DiscoveryProfile]:
        """Suggestions around the viewer's own position; people already liked are skipped."""
        lat, lon = await self._viewer_position(viewer_id)
        return await self._find(viewer_id, lat, lon, q, exclude_liked=True)

    async def search(self, viewer_id: int, q: SearchQuery) -> list[DiscoveryProfile]:
        """User-driven search; `location` replaces the viewer's position as the reference point."""
        lat: Optional[float]
        lon: Optional[float]
        if q.location:
            lat, lon = await self._geocode(q.location)
        else:
            lat, lon = await self._viewer_position(viewer_id)
        return await self._find(viewer_id, lat, lon, q, exclude_liked=False)

    async def map_users(self, viewer_id: int, q: MapQuery) -> list[MapUser]:
        """Eligible users whose grid-snapped position falls inside the viewport box."""
        if q.min_lat >= q.max_lat:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="min_lat must be less than max_lat"
            )
        if q.min_lng >= q.max_lng:
            # Boxes crossing the antimeridian (min_lng > max_lng) are not supported.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="min_lng must be less than max_lng (areas crossing the antimeridian are not supported)",
            )
        rows = await self.repo.find_in_bounds(
            viewer_id, q.min_lat, q.max_lat, q.min_lng, q.max_lng, q.limit
        )
        return [MapUser(**{**dict(r), "photo_url": to_photo_url(r["photo_url"])}) for r in rows]

    async def _viewer_position(self, viewer_id: int) -> tuple[Optional[float], Optional[float]]:
        row = await self.repo.get_viewer_location(viewer_id)
        if row is None:
            return None, None
        return row["latitude"], row["longitude"]

    async def _geocode(self, location: str) -> tuple[float, float]:
        try:
            found = await geocoding.geocode_city(location)
        except Exception as e:
            logger.warning("Geocoding failed: %s", type(e).__name__)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Location service unavailable — try again later",
            )
        if not found:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not find that location — try a different city",
            )
        return found[0], found[1]

    async def _find(
        self,
        viewer_id: int,
        lat: Optional[float],
        lon: Optional[float],
        q: DiscoveryQuery,
        exclude_liked: bool,
    ) -> list[DiscoveryProfile]:
        if q.max_distance_km is not None and (lat is None or lon is None):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Set your location (or search a city) to filter by distance",
            )
        rows = await self.repo.find_candidates(viewer_id, lat, lon, q, exclude_liked)
        if not rows:
            return []

        ids = [r["user_id"] for r in rows]
        tags: dict[int, list[str]] = defaultdict(list)
        for r in await self.repo.get_tags_for(ids):
            tags[r["user_id"]].append(r["name"])
        photos: dict[int, list[PhotoResponse]] = defaultdict(list)
        for r in await self.repo.get_photos_for(ids):
            photo = dict(r)
            photo["url"] = to_photo_url(photo["url"])
            photos[r["user_id"]].append(PhotoResponse(**photo))

        results = []
        for r in rows:
            data = dict(r)
            if data["distance_km"] is not None:
                # Whole km, at least 1: never finer than the position grid.
                data["distance_km"] = float(max(1, math.ceil(data["distance_km"])))
            data["score"] = round(data["score"], 4)
            results.append(DiscoveryProfile(**data, tags=tags[r["user_id"]], photos=photos[r["user_id"]]))
        return results
