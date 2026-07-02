"""Cheaper-store finder endpoint tests — Kroger/Places seams mocked (no network, no DB)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.api.finder as finder_mod
from app.core.auth import current_user_id
from app.main import app
from app.services import kroger, places
from app.services.comparable import ComparableSpec

_SPEC = ComparableSpec(
    canonical_name="milk, 2%",
    search_term="2% milk",
    dimension="volume",
    attributes=["2% fat", "dairy"],
    exclude_terms=["almond", "organic"],
)


@pytest.fixture
def client(monkeypatch) -> TestClient:
    app.dependency_overrides[current_user_id] = lambda: "u1"
    monkeypatch.setattr(finder_mod, "build_comparable_spec", lambda item, cat: _SPEC)
    monkeypatch.setattr(places, "is_configured", lambda: False)
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_finder_ranks_kroger_shelf_and_applies_strict_excludes(client, monkeypatch) -> None:
    monkeypatch.setattr(kroger, "is_configured", lambda: True)
    monkeypatch.setattr(
        kroger,
        "find_locations",
        lambda lat, lng, **k: [
            {
                "location_id": "L1",
                "name": "Kroger Main",
                "address": "1 Main St",
                "lat": 1.0,
                "lng": 2.0,
            }
        ],
    )
    monkeypatch.setattr(
        kroger,
        "search_products",
        lambda term, loc, **k: [
            {"title": "Kroger 2% Milk, 1 gal", "price_cents": 359, "size": "1 gal"},
            {"title": "Kroger 2% Milk Half Gallon, 1/2 gal", "price_cents": 259, "size": "1/2 gal"},
            {"title": "Silk Almond Milk, 64 fl oz", "price_cents": 399, "size": "64 fl oz"},
        ],
    )

    body = client.get(
        "/api/finder", params={"item": "milk, 2%", "lat": 39.1, "lng": -84.5, "radius": 5}
    ).json()

    assert body["kroger_configured"] is True and body["places_configured"] is False
    assert body["searched_store"]["name"] == "Kroger Main"
    assert body["base_unit"] == "fl oz"
    titles = [r["title"] for r in body["results"]]
    assert "Silk Almond Milk, 64 fl oz" not in titles  # strict drops plant milk
    # Gallon (3c/fl oz) beats the half-gallon (4c/fl oz) per unit.
    assert titles[0] == "Kroger 2% Milk, 1 gal"
    assert body["results"][0]["unit_price_cents"] == 3


def test_medium_tightness_keeps_cross_line_products(client, monkeypatch) -> None:
    monkeypatch.setattr(kroger, "is_configured", lambda: True)
    monkeypatch.setattr(
        kroger,
        "find_locations",
        lambda lat, lng, **k: [
            {"location_id": "L1", "name": "K", "address": "", "lat": 1.0, "lng": 2.0}
        ],
    )
    monkeypatch.setattr(
        kroger,
        "search_products",
        lambda term, loc, **k: [
            {"title": "Silk Almond Milk, 64 fl oz", "price_cents": 399, "size": "64 fl oz"}
        ],
    )
    body = client.get(
        "/api/finder", params={"item": "milk, 2%", "lat": 39.1, "lng": -84.5, "tightness": "medium"}
    ).json()
    assert [r["title"] for r in body["results"]] == ["Silk Almond Milk, 64 fl oz"]


def test_finder_reports_not_configured_when_no_kroger(client, monkeypatch) -> None:
    monkeypatch.setattr(kroger, "is_configured", lambda: False)
    body = client.get("/api/finder", params={"item": "milk, 2%", "lat": 39.1, "lng": -84.5}).json()
    assert body["kroger_configured"] is False
    assert body["results"] == [] and body["searched_store"] is None


def test_bad_tightness_is_rejected(client) -> None:
    resp = client.get(
        "/api/finder", params={"item": "x", "lat": 1, "lng": 2, "tightness": "nonsense"}
    )
    assert resp.status_code == 400
