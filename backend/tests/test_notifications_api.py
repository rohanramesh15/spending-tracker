"""Integration tests for the daily scan + notifications API (docs/subscriptions-plan.md §5).

Against a migrated Postgres: ``scan_all_subscriptions`` recomputes, emits deduped alerts, and
auto-cancels overdue subs ONLY when the account has synced past the deadline (the sync gate).
The notifications API lists + marks read.

Skipped until a migrated Postgres is reachable via SUPABASE_DB_URL.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api.subscriptions import scan_all_subscriptions
from app.core.auth import current_user_id, get_db
from app.core.db import admin_session, engine, rls_session
from app.main import app


def _schema_ready() -> bool:
    try:
        with engine.connect() as conn:
            return (
                conn.execute(text("SELECT to_regclass('public.notifications')")).scalar()
                is not None
            )
    except Exception:  # noqa: BLE001
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
            for tbl in ("notifications", "subscriptions", "transactions", "linked_accounts"):
                db.execute(text(f"DELETE FROM {tbl} WHERE user_id = :u"), {"u": user_id})
            db.commit()


def _ingest_recurring(c: TestClient, vendor: str, *, count: int, amount: int, prefix: str) -> None:
    start = date(2026, 1, 1)
    for i in range(count):
        body = {
            "source": "plaid",
            "external_id": f"{prefix}_{i}",
            "vendor": vendor,
            "purchased_on": str(start + timedelta(days=30 * i)),
            "total_cents": amount,
            "line_items": [],
        }
        assert c.post("/api/ingest", json=body).json()["status"] == "created"


def _add_active_account(uid: uuid.UUID, last_synced: datetime) -> None:
    with admin_session() as db:
        db.execute(
            text(
                "INSERT INTO linked_accounts "
                "(user_id, institution, source, status, last_synced_at) "
                "VALUES (:u, 'Test Bank', 'plaid', 'active', :ls)"
            ),
            {"u": uid, "ls": last_synced},
        )
        db.commit()


def test_scan_emits_a_new_subscription_notification(client) -> None:
    c, _uid = client
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")

    # today near the data → detected & not overdue → a single "new" alert.
    scan_all_subscriptions(today=date(2026, 6, 15))

    notifs = c.get("/api/notifications").json()
    new = [n for n in notifs if n["kind"] == "new" and "Netflix" in n["title"]]
    assert len(new) == 1
    assert new[0]["read"] is False


def test_scan_is_idempotent_via_dedup_key(client) -> None:
    c, _uid = client
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")
    scan_all_subscriptions(today=date(2026, 6, 15))
    scan_all_subscriptions(today=date(2026, 6, 15))  # same day, same state
    new = [n for n in c.get("/api/notifications").json() if n["kind"] == "new"]
    assert len(new) == 1  # not duplicated


def test_scan_cancels_overdue_sub_only_when_synced_past_deadline(client) -> None:
    c, uid = client
    # netflix last charge ~2026-05-31 → next ~2026-06-30 → deadline ~2026-07-05.
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")
    _add_active_account(uid, last_synced=datetime(2026, 8, 15))  # synced well past the deadline
    scan_all_subscriptions(today=date(2026, 6, 15))  # seed as detected
    scan_all_subscriptions(today=date(2026, 9, 1))  # now overdue + synced past → cancel

    netflix = next(
        s
        for s in c.get("/api/subscriptions", params={"include_hidden": True}).json()
        if s["merchant"] == "netflix"
    )
    assert netflix["status"] == "cancelled"
    assert any(n["kind"] == "likely_cancelled" for n in c.get("/api/notifications").json())


def test_scan_does_not_cancel_when_link_is_stale(client) -> None:
    c, uid = client
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")
    _add_active_account(uid, last_synced=datetime(2026, 6, 20))  # BEFORE the ~2026-07-05 deadline
    scan_all_subscriptions(today=date(2026, 6, 15))
    scan_all_subscriptions(today=date(2026, 9, 1))

    netflix = next(
        s
        for s in c.get("/api/subscriptions", params={"include_hidden": True}).json()
        if s["merchant"] == "netflix"
    )
    assert netflix["status"] != "cancelled"  # stale link → don't conclude cancelled


def test_mark_read_and_read_all(client) -> None:
    c, _uid = client
    _ingest_recurring(c, "netflix", count=6, amount=1599, prefix="nflx")
    scan_all_subscriptions(today=date(2026, 6, 15))

    notifs = c.get("/api/notifications").json()
    assert notifs and all(n["read"] is False for n in notifs)

    one = c.post(f"/api/notifications/{notifs[0]['id']}/read").json()
    assert one["read"] is True

    marked = c.post("/api/notifications/read-all").json()["marked"]
    assert marked == len(notifs) - 1  # the rest
    assert all(n["read"] for n in c.get("/api/notifications").json())


def test_mark_read_unknown_id_is_404(client) -> None:
    c, _uid = client
    resp = c.post(f"/api/notifications/{uuid.uuid4()}/read")
    assert resp.status_code == 404
