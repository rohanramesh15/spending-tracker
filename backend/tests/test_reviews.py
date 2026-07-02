"""Unattended reconciliation + review-queue integration tests (plan §6.3, user-flow §6).

Exercises the real ingest door + reviews API against a migrated Postgres: an unattended
(Plaid) match is parked in the needs-review queue and never auto-merged, idempotent
redelivery is a no-op, and each of the four resolutions drains the queue correctly.

Skipped until a migrated Postgres is reachable via SUPABASE_DB_URL (same gate as the RLS
smoke test). Run against a disposable Postgres — it writes and deletes transactions.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

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
                conn.execute(text("SELECT to_regclass('public.transactions')")).scalar() is not None
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
            db.execute(text("DELETE FROM transactions WHERE user_id = :u"), {"u": user_id})
            db.commit()


def _existing_manual(**overrides) -> dict:
    """An itemized confirmed entry that a later Plaid transaction will match."""
    payload = {
        "source": "manual",
        "vendor": "Kroger",
        "purchased_on": "2026-07-02",
        "subtotal_cents": 1248,
        "total_cents": 1248,
        "line_items": [
            {"raw_name": "MILK 2%", "price_cents": 399},
            {"raw_name": "BANANAS", "price_cents": 849},
        ],
    }
    payload.update(overrides)
    return payload


def _incoming_plaid(**overrides) -> dict:
    """A bank (unitemized) transaction, as a webhook/sync would post it."""
    payload = {
        "source": "plaid",
        "external_id": "plaid_txn_1",
        "vendor": "KROGER #456",
        "purchased_on": "2026-07-02",
        "total_cents": 1248,
        "line_items": [],
    }
    payload.update(overrides)
    return payload


def _count(sql: str, **params) -> int:
    with admin_session() as db:
        return db.execute(text(sql), params).scalar_one()


def _txn_count(uid: uuid.UUID) -> int:
    return _count("SELECT count(*) FROM transactions WHERE user_id = :u", u=uid)


def _item_count(txn_id: str) -> int:
    return _count("SELECT count(*) FROM line_items WHERE transaction_id = :t", t=txn_id)


def _open_reviews(uid: uuid.UUID) -> int:
    return _count(
        "SELECT count(*) FROM reconciliation_reviews WHERE user_id = :u AND resolved_at IS NULL",
        u=uid,
    )


def _queue_one(c: TestClient) -> str:
    """Seed a confirmed entry + a matching Plaid transaction; return the review id."""
    c.post("/api/ingest", json=_existing_manual())
    parked = c.post("/api/ingest", json=_incoming_plaid()).json()
    assert parked["status"] == "needs_review"
    assert parked["transaction"]["review_status"] == "needs_review"
    reviews = c.get("/api/reviews").json()
    assert len(reviews) == 1
    return reviews[0]["id"]


def test_unattended_match_parks_in_queue_never_auto_merged(client) -> None:
    c, uid = client
    review_id = _queue_one(c)
    assert review_id
    assert _open_reviews(uid) == 1
    assert _txn_count(uid) == 2  # both exist; the incoming is just parked


def test_plaid_without_match_is_confirmed_directly(client) -> None:
    c, uid = client
    body = c.post("/api/ingest", json=_incoming_plaid(vendor="Nowhere Special")).json()
    assert body["status"] == "created"
    assert body["transaction"]["review_status"] == "confirmed"
    assert _open_reviews(uid) == 0


def test_idempotent_plaid_redelivery_returns_existing(client) -> None:
    c, uid = client
    first = c.post("/api/ingest", json=_incoming_plaid(vendor="Nowhere Special")).json()
    again = c.post("/api/ingest", json=_incoming_plaid(vendor="Nowhere Special")).json()
    assert again["status"] == "exists"
    assert again["transaction"]["id"] == first["transaction"]["id"]
    assert _txn_count(uid) == 1


def test_list_reviews_carries_both_sides_and_a_reason(client) -> None:
    c, _uid = client
    _queue_one(c)
    review = c.get("/api/reviews").json()[0]
    assert review["incoming"]["source"] == "plaid"
    assert review["matched"]["source"] == "manual"
    assert review["matched"]["item_count"] == 2
    assert "same vendor" in review["reason"] and "same total" in review["reason"]


def test_resolve_merge_keeps_bank_row_with_receipt_items(client) -> None:
    c, uid = client
    review_id = _queue_one(c)
    incoming_id = c.get("/api/reviews").json()[0]["incoming"]["id"]

    body = c.post(f"/api/reviews/{review_id}/resolve", json={"resolution": "merge"}).json()
    assert body["status"] == "resolved"
    # Survivor is the bank transaction, now confirmed and carrying the matched items.
    assert body["transaction_id"] == incoming_id
    assert _txn_count(uid) == 1
    assert _item_count(incoming_id) == 2
    assert _open_reviews(uid) == 0


def test_resolve_keep_both_confirms_incoming_and_keeps_both(client) -> None:
    c, uid = client
    review_id = _queue_one(c)
    c.post(f"/api/reviews/{review_id}/resolve", json={"resolution": "keep_both"})
    assert _txn_count(uid) == 2
    assert _open_reviews(uid) == 0  # row marked resolved, off the open queue


def test_resolve_skip_discards_incoming(client) -> None:
    c, uid = client
    review_id = _queue_one(c)
    matched_id = c.get("/api/reviews").json()[0]["matched"]["id"]
    body = c.post(f"/api/reviews/{review_id}/resolve", json={"resolution": "skip"}).json()
    assert body["transaction_id"] == matched_id
    assert _txn_count(uid) == 1
    assert _item_count(matched_id) == 2  # the surviving entry is untouched
    assert _open_reviews(uid) == 0


def test_resolve_replace_drops_existing_entry(client) -> None:
    c, uid = client
    review_id = _queue_one(c)
    incoming_id = c.get("/api/reviews").json()[0]["incoming"]["id"]
    body = c.post(f"/api/reviews/{review_id}/resolve", json={"resolution": "replace"}).json()
    assert body["transaction_id"] == incoming_id
    assert _txn_count(uid) == 1
    assert _item_count(incoming_id) == 0  # bank row wins, itemization discarded
    assert _open_reviews(uid) == 0


def test_resolve_unknown_review_is_404(client) -> None:
    c, _uid = client
    missing = str(uuid.uuid4())
    resp = c.post(f"/api/reviews/{missing}/resolve", json={"resolution": "merge"})
    assert resp.status_code == 404
