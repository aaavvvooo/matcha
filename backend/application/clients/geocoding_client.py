import os
import httpx

NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "matcha-dating-app")
ACCEPT_LANGUAGE = os.getenv("NOMINATIM_ACCEPT_LANGUAGE", "en")


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
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{NOMINATIM_URL}/search",
            params={
                "q": query,
                "format": "jsonv2",
                "limit": 1,
                "addressdetails": 1,
                "accept-language": ACCEPT_LANGUAGE,
            },
            headers={"User-Agent": USER_AGENT},
        )
        resp.raise_for_status()
        results = resp.json()
    if not results:
        return None
    result = results[0]
    label = _label_from_address(result.get("address", {}), result.get("display_name"))
    return float(result["lat"]), float(result["lon"]), label


async def reverse_geocode(latitude: float, longitude: float) -> str | None:
    """Reverse geocoding: coordinates -> human-readable "City, Country" label."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{NOMINATIM_URL}/reverse",
            params={
                "lat": latitude,
                "lon": longitude,
                "format": "jsonv2",
                "zoom": 10,
                "accept-language": ACCEPT_LANGUAGE,
            },
            headers={"User-Agent": USER_AGENT},
        )
        resp.raise_for_status()
        result = resp.json()
    if not result or "address" not in result:
        return None
    return _label_from_address(result["address"], result.get("display_name"))
