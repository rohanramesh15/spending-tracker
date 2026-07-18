"""Integration tests for the subscriptions API (docs/subscriptions-plan.md §2–§4).

v3 semantics against a migrated Postgres: ``POST /recompute`` detects + upserts into the
``subscriptions`` table; ``GET`` reads it (hidden statuses excluded); status changes persist;
recompute is idempotent and never resurfaces a dismissed sub or overwrites a user status.
Detection logic itself is unit-tested in ``test_subscriptions.py``.

Skipped until a migrated Postgres is reachable via SUPABASE_DB_URL. Run against a disposable
Postgres — it writes and deletes rows.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import current_user_id, get_db
from app.core.db import admin_session, engine, rls_session
from app.main import app


def _schema_ready() -> bool:
    try:
        with engine.connect() as conn:
            return (
                conn.execute(text("SELECT to_regclass('public.subscriptions')")).scalar()
                is not None
            )
    except Exception:  # noqa: BLE001 - any connection failure means "not ready"
        return False


pytestmark = pytest.mark.skipif(
    not _schema_ready(),
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying the migration.",
)


@pytest.fixture
def client() -> Iterator[tuple[TestClient, uuid.UUID]]:
    user_id = uuid.uuid4()
    claims = {"sub": str(user_id), "role": "authenticated"}

    def _override_db() -> Iterator[object]:
        with rls_session(claims) as session:
            yield session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[current_user_id] = lambda: str(user_id)
    try:
        yield TestClient(app), user_id
    finally:
        app.dependency_overrides.clear()
        with admin_session() as db:
            db.execute(text("DELETE FROM subscriptions WHERE user_id = :u"), {"u": user_id})
            db.execute(text("DELETE FROM transactions WHERE user_id = :u"), {"u": user_id})
            db.commit()


def _ingest_recurring(
    c: TestClient, vendor: str, *, count: int, amount: int, prefix: str, step_days: int = 30
) -> None:
    start = date(2026, 1, 1)
    for i in range(count):
        body = {
            "source": "plaid",
            "external_id": f"{prefix}_{i}",
            "vendor": vendor,
            "purchased_on": str(start + timedelta(days=step_days * i)),
            "total_cents": amount,
            "line_items": [],
        }
        assert c.post("/api/ingest", json=body).json()["status"] == "created"


def _merchants(rows: list[dict]) -> list[str]:
    return [r["merchant"] for r in rows]


def test_recompute_detects_and_persists_then_get_reads_the_table(client) -> None:
    c, uid = client
    _ingest_recurring(c, "NETFLIX.COM", count=6, amount=1599, prefix="nflx")

    # Nothing stored yet → GET is empty until a recompute runs.
    assert c.get("/api/subscriptions").json() == []

    recomputed = c.post("/api/subscriptions/recompute").json()
    netflix = next((s for s in recomputed if s["merchant"] == "netflix"), None)
    assert netflix is not None
    assert netflix["cadence"] == "monthly"
    assert netflix["status"] == "detected"
    assert netflix["id"]

    # Now GET reads it back from the table.
    assert "netflix" in _merchants(c.get("/api/subscriptions").json())


def test_recompute_is_idempotent_and_updates_in_place(client) -> None:
    c, uid = client
    _ingest_recurring(c, "spotify", count=6, amount=1099, prefix="spot")
    first = c.post("/api/subscriptions/recompute").json()
    sub_id = next(s["id"] for s in first if s["merchant"] == "spotify")

    # A new, higher charge lands; recompute must UPDATE the same row, not duplicate it.
    _ingest_recurring(c, "spotify", count=1, amount=1299, prefix="spot_hike", step_days=0)
    # place the hike after the last existing charge
    with admin_session() as db:
        db.execute(
            text(
                "UPDATE transactions SET purchased_on = :d "
                "WHERE user_id = :u AND external_id = 'spot_hike_0'"
            ),
            {"u": uid, "d": date(2026, 7, 1)},
        )
        db.commit()

    second = c.post("/api/subscriptions/recompute").json()
    spotify_rows = [s for s in second if s["merchant"] == "spotify"]
    assert len(spotify_rows) == 1  # no duplicate
    assert spotify_rows[0]["id"] == sub_id  # same row
    assert spotify_rows[0]["occurrences"] == 7  # picked up the new charge


def test_status_change_persists_and_hidden_from_default_view(client) -> None:
    c, _uid = client
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")
    rows = c.post("/api/subscriptions/recompute").json()
    sub_id = next(s["id"] for s in rows if s["merchant"] == "netflix")

    confirmed = c.post(f"/api/subscriptions/{sub_id}/status", json={"status": "confirmed"}).json()
    assert confirmed["status"] == "confirmed"

    dismissed = c.post(f"/api/subscriptions/{sub_id}/status", json={"status": "dismissed"}).json()
    assert dismissed["status"] == "dismissed"

    # Dismissed is hidden from the default view but visible with include_hidden.
    assert "netflix" not in _merchants(c.get("/api/subscriptions").json())
    assert "netflix" in _merchants(
        c.get("/api/subscriptions", params={"include_hidden": True}).json()
    )


def test_recompute_never_resurfaces_a_dismissed_sub_or_overwrites_status(client) -> None:
    c, _uid = client
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")
    rows = c.post("/api/subscriptions/recompute").json()
    sub_id = next(s["id"] for s in rows if s["merchant"] == "netflix")
    c.post(f"/api/subscriptions/{sub_id}/status", json={"status": "dismissed"})

    # Recompute again — the dismissed row must stay dismissed (status is user-owned).
    c.post("/api/subscriptions/recompute")
    assert "netflix" not in _merchants(c.get("/api/subscriptions").json())
    hidden = c.get("/api/subscriptions", params={"include_hidden": True}).json()
    netflix = next(s for s in hidden if s["merchant"] == "netflix")
    assert netflix["status"] == "dismissed"


def test_needs_review_transactions_excluded_from_detection(client) -> None:
    c, uid = client
    # Unknown merchant, exactly the floor of 3 — dropping one below the floor un-detects it.
    _ingest_recurring(c, "Fit Club Xyz", count=3, amount=4200, prefix="fit")
    with admin_session() as db:
        db.execute(
            text(
                "UPDATE transactions SET review_status = 'needs_review' "
                "WHERE user_id = :u AND external_id = 'fit_0'"
            ),
            {"u": uid},
        )
        db.commit()
    rows = c.post("/api/subscriptions/recompute").json()
    assert "fit club xyz" not in _merchants(rows)


def test_set_status_on_unknown_id_is_404(client) -> None:
    c, _uid = client
    resp = c.post(f"/api/subscriptions/{uuid.uuid4()}/status", json={"status": "confirmed"})
    assert resp.status_code == 404


def test_summary_totals_and_trend(client) -> None:
    c, _uid = client
    # Two active subs; a dismissed one must be excluded from the totals.
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")
    _ingest_recurring(c, "spotify", count=6, amount=1099, prefix="spot")
    _ingest_recurring(c, "Some Store Xyz", count=3, amount=4200, prefix="store")
    rows = c.post("/api/subscriptions/recompute").json()
    store_id = next(s["id"] for s in rows if s["merchant"] == "some store xyz")
    c.post(f"/api/subscriptions/{store_id}/status", json={"status": "dismissed"})

    summary = c.get("/api/subscriptions/summary", params={"months": 6}).json()
    # netflix 1599 + spotify 1099 = 2698/mo; store is dismissed → excluded.
    assert summary["total_monthly_cents"] == 2698
    assert summary["annualized_cents"] == 2698 * 12
    assert summary["active_count"] == 2
    assert len(summary["trend"]) == 6
    assert {b["type"] for b in summary["by_type"]}  # non-empty breakdown
