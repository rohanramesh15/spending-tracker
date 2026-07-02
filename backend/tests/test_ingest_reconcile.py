"""Attended reconciliation integration tests (plan §6.3, CLAUDE.md #4/#5).

Exercises the real ``POST /api/ingest`` decision paths against a migrated Postgres:
needs_decision → merge / skip / replace / keep-both. The merge and replace paths delete
rows, so they earn DB-level coverage rather than a mock.

Skipped automatically until a migrated Postgres is reachable via SUPABASE_DB_URL (same
gate as the RLS smoke test). Run locally against a disposable Postgres — never point it
at a shared/real database, since it writes and deletes transactions.
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
    """A TestClient whose requests run as a synthetic user with RLS claims applied."""
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


def _receipt_payload(**overrides) -> dict:
    payload = {
        "source": "receipt",
        "vendor": "Kroger #456",
        "purchased_on": "2026-07-02",
        "subtotal_cents": 1177,
        "tax_cents": 71,
        "tip_cents": 0,
        "total_cents": 1248,
        "line_items": [
            {"raw_name": "MILK 2%", "price_cents": 399},
            {"raw_name": "BANANAS", "price_cents": 129},
            {"raw_name": "BREAD", "price_cents": 449},
            {"raw_name": "PAPER TOWELS", "price_cents": 200},
        ],
        "raw_extraction_json": {"vendor": "Kroger"},
    }
    payload.update(overrides)
    return payload


def _manual_payload(**overrides) -> dict:
    payload = {
        "source": "manual",
        "vendor": "Kroger",
        "purchased_on": "2026-07-02",
        "subtotal_cents": 1248,
        "total_cents": 1248,
        "line_items": [{"raw_name": "Kroger", "price_cents": 1248}],
    }
    payload.update(overrides)
    return payload


def _txn_count(user_id: uuid.UUID) -> int:
    with admin_session() as db:
        return db.execute(
            text("SELECT count(*) FROM transactions WHERE user_id = :u"), {"u": user_id}
        ).scalar_one()


def _item_count(txn_id: str) -> int:
    with admin_session() as db:
        return db.execute(
            text("SELECT count(*) FROM line_items WHERE transaction_id = :t"), {"t": txn_id}
        ).scalar_one()


def test_unique_transaction_is_created(client) -> None:
    c, _uid = client
    resp = c.post("/api/ingest", json=_receipt_payload(vendor="Somewhere Unique"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "created"
    assert body["transaction"]["vendor"] == "Somewhere Unique"


def test_semantic_duplicate_returns_needs_decision_without_writing(client) -> None:
    c, uid = client
    first = c.post("/api/ingest", json=_manual_payload()).json()
    assert first["status"] == "created"

    # Same store (different formatting), same day, same total → a duplicate.
    resp = c.post("/api/ingest", json=_receipt_payload())
    body = resp.json()
    assert body["status"] == "needs_decision"
    assert body["transaction"] is None
    assert body["match"]["matched_transaction_id"] == first["transaction"]["id"]
    # Nothing new was written — the incoming is held pending the user's choice.
    assert _txn_count(uid) == 1


def test_merge_overlays_receipt_itemization_onto_existing(client) -> None:
    c, uid = client
    existing = c.post("/api/ingest", json=_manual_payload()).json()["transaction"]
    assert _item_count(existing["id"]) == 1  # quick-entry single line

    resp = c.post(
        "/api/ingest",
        json=_receipt_payload(resolution="merge", matched_transaction_id=existing["id"]),
    )
    body = resp.json()
    assert body["status"] == "resolved"
    # Same surviving row; still exactly one transaction; now carries the receipt's 4 items.
    assert body["transaction"]["id"] == existing["id"]
    assert _txn_count(uid) == 1
    assert _item_count(existing["id"]) == 4


def test_skip_keeps_existing_and_discards_incoming(client) -> None:
    c, uid = client
    existing = c.post("/api/ingest", json=_manual_payload()).json()["transaction"]

    resp = c.post(
        "/api/ingest",
        json=_receipt_payload(resolution="skip", matched_transaction_id=existing["id"]),
    )
    body = resp.json()
    assert body["status"] == "skipped"
    assert body["transaction"]["id"] == existing["id"]
    assert _txn_count(uid) == 1
    assert _item_count(existing["id"]) == 1  # untouched


def test_replace_swaps_in_the_incoming_transaction(client) -> None:
    c, uid = client
    existing = c.post("/api/ingest", json=_manual_payload()).json()["transaction"]

    resp = c.post(
        "/api/ingest",
        json=_receipt_payload(resolution="replace", matched_transaction_id=existing["id"]),
    )
    body = resp.json()
    assert body["status"] == "resolved"
    # The old row is gone; exactly one transaction remains, and it's the new receipt.
    assert body["transaction"]["id"] != existing["id"]
    assert body["transaction"]["source"] == "receipt"
    assert _txn_count(uid) == 1
    assert _item_count(body["transaction"]["id"]) == 4


def test_keep_both_inserts_a_second_transaction(client) -> None:
    c, uid = client
    existing = c.post("/api/ingest", json=_manual_payload()).json()["transaction"]

    resp = c.post(
        "/api/ingest",
        json=_receipt_payload(resolution="keep_both", matched_transaction_id=existing["id"]),
    )
    body = resp.json()
    assert body["status"] == "created"
    assert body["transaction"]["id"] != existing["id"]
    assert _txn_count(uid) == 2
