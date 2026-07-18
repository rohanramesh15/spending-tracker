"""Plaid sync → ingest tests (plan §6.7, Phase 3).

The Plaid *seam* (``services.plaid_client``) is mocked, so these run in CI with no network
and no keys — they verify the wiring the live Sandbox e2e can't assert repeatably: which
transactions are ingested vs. skipped, that a match lands in the needs-review queue
(never auto-merged), that ``removed`` deletes, and that re-sync is idempotent.

Needs a migrated Postgres (same gate as the RLS smoke test) for the real reconciliation
path. Run against a disposable Postgres.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import current_user_id, get_db
from app.core.db import admin_session, engine, rls_session
from app.main import app
from app.services import plaid_client


def _schema_ready() -> bool:
    try:
        with engine.connect() as conn:
            return (
                conn.execute(text("SELECT to_regclass('public.linked_accounts')")).scalar()
                is not None
            )
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(
    not _schema_ready(),
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying migrations.",
)


@pytest.fixture
def client(monkeypatch) -> Iterator[tuple[TestClient, uuid.UUID]]:
    user_id = uuid.uuid4()
    claims = {"sub": str(user_id), "role": "authenticated"}

    def _override_db() -> Iterator[object]:
        with rls_session(claims) as session:
            yield session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[current_user_id] = lambda: str(user_id)
    monkeypatch.setattr(plaid_client, "is_configured", lambda: True)
    # Rewards card-backfill runs on sync; mock the Plaid accounts call so no test hits network.
    monkeypatch.setattr(plaid_client, "get_accounts", lambda at: [])
    # A linked Item to sync (would normally come from /exchange).
    with admin_session() as db:
        db.execute(
            text(
                "INSERT INTO linked_accounts "
                "(user_id, institution, source, item_id, access_token, status) "
                "VALUES (:u, 'Test Bank', 'plaid', 'item-1', 'tok-1', 'active')"
            ),
            {"u": user_id},
        )
        db.commit()
    try:
        yield TestClient(app), user_id
    finally:
        app.dependency_overrides.clear()
        with admin_session() as db:
            db.execute(text("DELETE FROM transactions WHERE user_id = :u"), {"u": user_id})
            db.execute(text("DELETE FROM linked_accounts WHERE user_id = :u"), {"u": user_id})
            db.commit()


def _txn(tid: str, name: str, cents: int, *, pending=False, pfc=None, day="2026-07-02") -> dict:
    return {
        "transaction_id": tid,
        "name": name,
        "amount_cents": cents,
        "currency": "USD",
        "purchased_on": date.fromisoformat(day),
        "pending": pending,
        "pfc_primary": pfc,
    }


def _mock_sync(monkeypatch, *, added=None, modified=None, removed=None, cursor="cur-1"):
    payload = {
        "added": added or [],
        "modified": modified or [],
        "removed": removed or [],
        "next_cursor": cursor,
    }
    monkeypatch.setattr(plaid_client, "sync_transactions", lambda at, cur: payload)


def _txn_count(uid: uuid.UUID) -> int:
    with admin_session() as db:
        return db.execute(
            text("SELECT count(*) FROM transactions WHERE user_id = :u"), {"u": uid}
        ).scalar_one()


def _vendors(uid: uuid.UUID) -> list[str]:
    with admin_session() as db:
        return list(
            db.execute(
                text("SELECT vendor FROM transactions WHERE user_id = :u ORDER BY vendor"),
                {"u": uid},
            ).scalars()
        )


def test_sync_ingests_money_out_including_outgoing_transfers(client, monkeypatch) -> None:
    c, uid = client
    _mock_sync(
        monkeypatch,
        added=[
            _txn("t1", "Starbucks", 433),  # purchase → keep
            _txn("t2", "Zelle to Roommate", 5000, pfc="TRANSFER_OUT"),  # outgoing transfer → KEEP
            _txn("t3", "Refund Co", -500),  # inflow (credit) → skip
            _txn("t4", "Pending Co", 999, pending=True),  # pending → skip
            _txn("t5", "Gusto Payroll", 585000, pfc="INCOME"),  # income → skip
            _txn("t6", "Zelle from Mom", -1200, pfc="TRANSFER_IN"),  # incoming transfer → skip
            _txn("t7", "Amex Payment", 20000, pfc="LOAN_PAYMENTS"),  # card payment → skip
        ],
    )
    body = c.post("/api/plaid/sync").json()
    assert body["added"] == 2
    assert body["needs_review"] == 0
    assert _vendors(uid) == ["Starbucks", "Zelle to Roommate"]
    # Per-account transparency: one account, 2 in, 5 filtered — never a bare "synced".
    assert len(body["accounts"]) == 1
    acct = body["accounts"][0]
    assert acct["institution"] == "Test Bank"
    assert acct["added"] == 2
    assert acct["skipped"] == 5
    assert acct["needs_attention"] is False


def test_sync_match_goes_to_review_queue_not_auto_merged(client, monkeypatch) -> None:
    c, uid = client
    # An existing hand-entered purchase the bank line will match.
    c.post(
        "/api/ingest",
        json={
            "source": "manual",
            "vendor": "Starbucks",
            "purchased_on": "2026-07-02",
            "total_cents": 433,
            "line_items": [{"raw_name": "latte", "price_cents": 433}],
        },
    )
    _mock_sync(monkeypatch, added=[_txn("t1", "Starbucks", 433)])
    body = c.post("/api/plaid/sync").json()
    assert (body["added"], body["needs_review"], body["removed"]) == (0, 1, 0)
    # The bank line is parked, not merged: both rows exist and a review is open.
    assert _txn_count(uid) == 2
    assert len(c.get("/api/reviews").json()) == 1


def test_sync_is_idempotent(client, monkeypatch) -> None:
    c, uid = client
    _mock_sync(monkeypatch, added=[_txn("t1", "Starbucks", 433)])
    c.post("/api/plaid/sync")
    body = c.post("/api/plaid/sync").json()  # same transaction_id again
    assert body["added"] == 0
    assert _txn_count(uid) == 1


def test_sync_removed_deletes_the_transaction(client, monkeypatch) -> None:
    c, uid = client
    _mock_sync(monkeypatch, added=[_txn("t1", "Starbucks", 433)])
    c.post("/api/plaid/sync")
    assert _txn_count(uid) == 1

    _mock_sync(monkeypatch, removed=["t1"])
    body = c.post("/api/plaid/sync").json()
    assert body["removed"] == 1
    assert _txn_count(uid) == 0


def test_sync_not_configured_returns_503(client, monkeypatch) -> None:
    c, _uid = client
    monkeypatch.setattr(plaid_client, "is_configured", lambda: False)
    assert c.post("/api/plaid/sync").status_code == 503


def test_sync_surfaces_account_needing_reconnect(client, monkeypatch) -> None:
    c, uid = client
    # A reauth-lapsed account must be REPORTED, not silently skipped ("doesn't just say synced").
    with admin_session() as db:
        db.execute(
            text("UPDATE linked_accounts SET status='needs_reauth' WHERE user_id = :u"),
            {"u": uid},
        )
        db.commit()
    body = c.post("/api/plaid/sync").json()
    assert len(body["accounts"]) == 1
    acct = body["accounts"][0]
    assert acct["status"] == "needs_reauth"
    assert acct["needs_attention"] is True
    assert acct["added"] == 0 and acct["message"]


def test_link_token_endpoint_returns_token(client, monkeypatch) -> None:
    c, _uid = client
    monkeypatch.setattr(plaid_client, "create_link_token", lambda uid, **kw: "link-sandbox-xyz")
    body = c.post("/api/plaid/link-token").json()
    assert body["link_token"] == "link-sandbox-xyz"


def test_webhook_rejects_unverified_request(client, monkeypatch) -> None:
    c, uid = client
    monkeypatch.setattr(plaid_client, "verify_webhook", lambda body, header: False)
    resp = c.post(
        "/api/plaid/webhook",
        json={"webhook_type": "TRANSACTIONS", "item_id": "item-1"},
    )
    assert resp.status_code == 401
    assert _txn_count(uid) == 0  # nothing processed


def test_webhook_verified_triggers_item_sync(client, monkeypatch) -> None:
    c, uid = client
    monkeypatch.setattr(plaid_client, "verify_webhook", lambda body, header: True)
    _mock_sync(monkeypatch, added=[_txn("t1", "Starbucks", 433)])
    resp = c.post(
        "/api/plaid/webhook",
        json={
            "webhook_type": "TRANSACTIONS",
            "webhook_code": "SYNC_UPDATES_AVAILABLE",
            "item_id": "item-1",  # the fixture's linked Item, owned by uid
        },
    )
    assert resp.status_code == 200
    assert _vendors(uid) == ["Starbucks"]
