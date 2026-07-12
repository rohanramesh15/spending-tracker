"""Kroger Products/Location API client seam (plan §6.9).

The only live price source for the finder. OAuth2 client-credentials (Products + Locations
scopes), Production base URL. No Kroger types leak past this module — callers get plain
dicts. If keys are unset, ``is_configured()`` is False and the finder reports Kroger as
unavailable rather than failing.
"""

from __future__ import annotations

import base64
import time
from decimal import ROUND_HALF_UP, Decimal

import httpx

from app.core.config import get_settings

_BASE = "https://api.kroger.com/v1"
_HTTP_TIMEOUT = 20.0

# Client-credentials token, cached in-process with its expiry (≈30 min).
_token: dict[str, object] = {"value": None, "expires_at": 0.0}


def is_configured() -> bool:
    s = get_settings()
    return bool(s.kroger_client_id and s.kroger_client_secret)


def _get_token() -> str:
    now = time.time()
    cached = _token["value"]
    if cached and float(_token["expires_at"]) > now + 30:
        return str(cached)

    s = get_settings()
    basic = base64.b64encode(f"{s.kroger_client_id}:{s.kroger_client_secret}".encode()).decode()
    resp = httpx.post(
        f"{_BASE}/connect/oauth2/token",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials", "scope": "product.compact"},
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    body = resp.json()
    _token["value"] = body["access_token"]
    _token["expires_at"] = now + float(body.get("expires_in", 1800))
    return str(_token["value"])


def _auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_get_token()}", "Accept": "application/json"}


def find_locations(
    lat: float, lng: float, *, radius_miles: int = 10, limit: int = 10
) -> list[dict]:
    """Kroger-family stores near a point, nearest first (plan §6.9 step 2)."""
    resp = httpx.get(
        f"{_BASE}/locations",
        headers=_auth_headers(),
        params={
            "filter.latLong.near": f"{lat},{lng}",
            "filter.radiusInMiles": radius_miles,
            "filter.limit": limit,
        },
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    out: list[dict] = []
    for loc in resp.json().get("data", []):
        geo = loc.get("geolocation") or {}
        addr = loc.get("address") or {}
        out.append(
            {
                "location_id": loc.get("locationId"),
                "name": loc.get("name"),
                "chain": loc.get("chain"),
                "address": ", ".join(
                    p for p in (addr.get("addressLine1"), addr.get("city"), addr.get("state")) if p
                ),
                "lat": geo.get("latitude"),
                "lng": geo.get("longitude"),
            }
        )
    return out


def search_products(term: str, location_id: str, *, limit: int = 20) -> list[dict]:
    """Priced products matching a term at one store (plan §6.9 step 3) — a whole shelf in
    one call. Returns ``[{title, price_cents, size}]``; unpriced items are dropped."""
    resp = httpx.get(
        f"{_BASE}/products",
        headers=_auth_headers(),
        params={
            "filter.term": term,
            "filter.locationId": location_id,
            "filter.limit": limit,
        },
        timeout=_HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    out: list[dict] = []
    for product in resp.json().get("data", []):
        items = product.get("items") or []
        if not items:
            continue
        price_obj = items[0].get("price") or {}
        price = price_obj.get("promo") or price_obj.get("regular")  # promo=0 → use regular
        if not price:
            continue
        size = items[0].get("size")
        cents = int((Decimal(str(price)) * 100).to_integral_value(ROUND_HALF_UP))
        title = product.get("description") or product.get("brand") or ""
        # Append the size so downstream parse_size() can read per-unit info from the title.
        if size and size.lower() not in title.lower():
            title = f"{title}, {size}".strip(", ")
        out.append({"title": title, "price_cents": cents, "size": size})
    return out
