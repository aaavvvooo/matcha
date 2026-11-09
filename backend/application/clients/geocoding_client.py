import asyncio
import os
import time
from typing import Any

import httpx

NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "matcha-dating-app")
ACCEPT_LANGUAGE = os.getenv("NOMINATIM_ACCEPT_LANGUAGE", "en")

# Nominatim's usage policy allows ~1 request/second per application, whoever the
# caller is; exceeding it gets the whole app blocked. One gate for all upstream
# calls, plus a cache so repeated lookups never leave the process.
_MIN_INTERVAL_S = 1.0
_MAX_WAITING = 10
_CACHE_TTL_S = 24 * 3600
_CACHE_MAX = 512

_gate = asyncio.Lock()
_waiting = 0
_last_call = 0.0
_cache: dict[tuple, tuple[float, Any]] = {}


class GeocoderBusy(Exception):
    """Too many lookups queued; callers map it like any outage (503)."""


async def _fetch(path: str, params: dict, cache_key: tuple) -> Any:
    global _waiting, _last_call
    hit = _cache.get(cache_key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    if _waiting >= _MAX_WAITING:
        raise GeocoderBusy()
    _waiting += 1
    try:
        async with _gate:
            delay = _last_call + _MIN_INTERVAL_S - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(
                        f"{NOMINATIM_URL}{path}",
                        params={**params, "format": "jsonv2", "accept-language": ACCEPT_LANGUAGE},
                        headers={"User-Agent": USER_AGENT},
                    )
                    resp.raise_for_status()
                    data = resp.json()
            finally:
                _last_call = time.monotonic()
    finally:
        _waiting -= 1
    if len(_cache) >= _CACHE_MAX:
        _cache.pop(next(iter(_cache)))  # oldest insertion
    _cache[cache_key] = (time.monotonic() + _CACHE_TTL_S, data)
    return data


def _label_from_address(address: dict, fallback: str | None) -> str | None:
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
    )
    country = address.get("country")
    parts = [p for p in (city, country) if p]
    if parts:
        return ", ".join(parts)
    return fallback


async def geocode_city(query: str) -> tuple[float, float, str] | None:
    """Forward geocoding: free-text city/neighborhood -> (latitude, longitude, label)."""
    query = query.strip()
    results = await _fetch(
        "/search", {"q": query, "limit": 1, "addressdetails": 1}, ("search", query.lower())
    )
    if not results:
        return None
    result = results[0]
    label = _label_from_address(result.get("address", {}), result.get("display_name"))
    return float(result["lat"]), float(result["lon"]), label


async def reverse_geocode(latitude: float, longitude: float) -> str | None:
    """Reverse geocoding: coordinates -> human-readable "City, Country" label."""
    # zoom 10 is city level, so ~100 m rounding doesn't change the label.
    result = await _fetch(
        "/reverse",
        {"lat": latitude, "lon": longitude, "zoom": 10},
        ("reverse", round(latitude, 3), round(longitude, 3)),
    )
    if not result or "address" not in result:
        return None
    return _label_from_address(result["address"], result.get("display_name"))
