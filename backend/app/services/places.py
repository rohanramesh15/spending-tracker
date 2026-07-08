"""Google Places seam — nearby grocery stores for the finder map (plan §6.9 step 2).

Non-Kroger stores are shown as map pins WITHOUT prices (Kroger is the only live price
source). Uses the Places API (New) ``searchNearby``. No Google types leak past this
module; if the key is unset, ``is_configured()`` is False and the finder skips the pins.
"""

from __future__ import annotations

import httpx

from app.core.config import get_settings

_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby"
_MILE_M = 1609.34
_MAX_RADIUS_M = 50_000.0  # Places caps the circle radius at 50 km
_HTTP_TIMEOUT = 15.0


def is_configured() -> bool:
    return bool(get_settings().google_places_api_key)


def find_stores(lat: float, lng: float, *, radius_miles: float = 5, limit: int = 20) -> list[dict]:
    """Grocery stores near a point → ``[{name, address, lat, lng}]`` (no prices)."""
    key = get_settings().google_places_api_key
    resp = httpx.post(
        _ENDPOINT,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key or "",
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
        },
        json={
            "includedTypes": ["supermarket", "grocery_store"],
            "maxResultCount": min(limit, 20),
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": min(radius_miles * _MILE_M, _MAX_RADIUS_M),
                }
            },
        },
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    out: list[dict] = []
    for place in resp.json().get("places", []):
        loc = place.get("location") or {}
        out.append(
            {
                "name": (place.get("displayName") or {}).get("text"),
                "address": place.get("formattedAddress"),
                "lat": loc.get("latitude"),
                "lng": loc.get("longitude"),
            }
        )
    return out
