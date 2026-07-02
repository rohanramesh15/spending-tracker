"""Cheaper-store finder (plan §6.9, user-flow §8c).

``GET /api/finder`` prices a recurring item near the user's location: build a comparable
spec (LLM), find nearby Kroger stores, price the item at the nearest one, and rank the
shelf by price-per-unit. Non-Kroger stores come back as map pins without prices (Kroger is
the only live price source). Location comes from the browser (geolocation); the radius is a
slider on the client.

MVP scope: fetched synchronously and returned fresh with an ``as_of`` stamp. The plan's
background-job + ``price_quotes`` cache is a deploy-time concern (EventBridge→SQS→worker);
not needed at single-user, on-demand volume.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.schemas import FinderProduct, FinderResult, FinderStore
from app.core.auth import current_user_id
from app.services import kroger, places
from app.services.comparable import build_comparable_spec
from app.services.pricing import base_unit_label, rank_products

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["finder"])

_MAX_RESULTS = 15


@router.get("/finder", response_model=FinderResult)
def finder(
    item: str = Query(..., min_length=1),
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(default=5, ge=1, le=25),
    tightness: str = Query(default="strict"),
    category: str | None = Query(default=None),
    _user_id: str = Depends(current_user_id),
) -> FinderResult:
    if tightness not in {"strict", "medium", "loose"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "tightness must be strict/medium/loose")

    spec = build_comparable_spec(item, category)
    # Strict never crosses the hard lines; medium/loose compare across the shelf.
    excludes = spec.exclude_terms if tightness == "strict" else []

    searched_store: FinderStore | None = None
    results: list[FinderProduct] = []
    nearby: list[FinderStore] = []

    if kroger.is_configured():
        locations = _safe(
            lambda: kroger.find_locations(lat, lng, radius_miles=int(radius), limit=8), []
        )
        nearby.extend(
            FinderStore(
                name=loc["name"],
                address=loc["address"],
                lat=loc["lat"],
                lng=loc["lng"],
                has_prices=True,
            )
            for loc in locations
        )
        if locations:
            nearest = locations[0]
            searched_store = FinderStore(
                name=nearest["name"],
                address=nearest["address"],
                lat=nearest["lat"],
                lng=nearest["lng"],
                has_prices=True,
            )
            products = _safe(
                lambda: kroger.search_products(spec.search_term, nearest["location_id"], limit=30),
                [],
            )
            ranked = rank_products(
                [(p["title"], p["price_cents"]) for p in products],
                dimension=spec.dimension,
                exclude_terms=excludes,
            )
            results = [
                FinderProduct(
                    title=r.title,
                    price_cents=r.price_cents,
                    unit_price_cents=r.unit_price_cents,
                    size=r.size.unit if r.size else None,
                )
                for r in ranked[:_MAX_RESULTS]
            ]

    if places.is_configured():
        stores = _safe(lambda: places.find_stores(lat, lng, radius_miles=radius), [])
        kroger_names = {s.name for s in nearby}
        nearby.extend(
            FinderStore(
                name=s["name"], address=s["address"], lat=s["lat"], lng=s["lng"], has_prices=False
            )
            for s in stores
            if s["name"] not in kroger_names  # don't double-pin a Kroger already found
        )

    return FinderResult(
        item=item,
        search_term=spec.search_term,
        dimension=spec.dimension,
        base_unit=base_unit_label(spec.dimension),
        attributes=spec.attributes,
        tightness=tightness,
        kroger_configured=kroger.is_configured(),
        places_configured=places.is_configured(),
        searched_store=searched_store,
        results=results,
        nearby_stores=nearby,
        as_of=datetime.now(UTC),
    )


def _safe(fn, default):
    """Run an external call; log and degrade to ``default`` on failure (never 500 the
    whole finder because one upstream hiccuped)."""
    try:
        return fn()
    except Exception:  # noqa: BLE001 - upstream API/network failure is non-fatal here
        logger.exception("Finder upstream call failed")
        return default
