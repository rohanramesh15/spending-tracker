"""GET /api/recurring integration test (plan §6.8). DB-gated like the RLS smoke test."""

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
                conn.execute(text("SELECT to_regclass('public.line_items')")).scalar() is not None
            )
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(
    not _schema_ready(),
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying migrations.",
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    user_id = uuid.uuid4()
    claims = {"sub": str(user_id), "role": "authenticated"}

    def _override_db() -> Iterator[object]:
        with rls_session(claims) as session:
            yield session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[current_user_id] = lambda: str(user_id)
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        with admin_session() as db:
            db.execute(text("DELETE FROM transactions WHERE user_id = :u"), {"u": user_id})
            db.commit()


def _receipt(c: TestClient, item: str, cents: int, days_ago: int) -> None:
    day = (date.today() - timedelta(days=days_ago)).isoformat()
    c.post(
        "/api/ingest",
        json={
            "source": "receipt",
            "vendor": f"Store {days_ago}",  # distinct vendors → distinct transactions
            "purchased_on": day,
            "total_cents": cents,
            "line_items": [
                {"raw_name": item.upper(), "normalized_name": item, "price_cents": cents}
            ],
        },
    )


def test_recurring_lists_items_bought_three_plus_times(client) -> None:
    c = client
    for i, cents in enumerate((399, 419, 405)):  # milk on 3 trips
        _receipt(c, "milk, 2%", cents, days_ago=i * 10)
    for i in range(2):  # bread on only 2 trips → not recurring
        _receipt(c, "bread", 300, days_ago=i * 10 + 3)

    data = c.get("/api/recurring").json()
    assert len(data) == 1
    item = data[0]
    assert item["canonical_name"] == "milk, 2%"
    assert item["occurrences"] == 3
    assert item["avg_unit_price_cents"] == round((399 + 419 + 405) / 3)
    assert len(item["price_history"]) == 3  # one point per trip day


def test_window_excludes_old_purchases(client) -> None:
    c = client
    _receipt(c, "milk, 2%", 400, days_ago=1)
    _receipt(c, "milk, 2%", 400, days_ago=5)
    _receipt(c, "milk, 2%", 400, days_ago=400)  # outside a 90-day window
    assert c.get("/api/recurring?window_days=90").json() == []  # only 2 trips in window
    assert len(c.get("/api/recurring?window_days=730").json()) == 1  # all 3 in a wide window
