"""Apple Card CSV import integration tests (plan §11, user-flow §9).

Drives the real POST /api/import/apple-card against a migrated Postgres: purchases flow
through the ingest door, re-upload is idempotent, and a purchase that matches an existing
manual entry lands in the needs-review queue (never auto-merged).

Skipped until a migrated Postgres is reachable via SUPABASE_DB_URL (same gate as the RLS
smoke test). Run against a disposable Postgres.
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
                conn.execute(text("SELECT to_regclass('public.linked_accounts')")).scalar()
                is not None
            )
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(
    not _schema_ready(),
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying migrations.",
)

_CSV = (
    "Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)\n"
    "07/01/2026,07/02/2026,APPLE.COM/BILL,Apple,Other,Purchase,9.99\n"
    "07/02/2026,07/03/2026,KROGER,Kroger,Grocery,Purchase,12.48\n"
    "07/03/2026,07/04/2026,PAYMENT,Apple Card,Payment,Payment,-100.00\n"
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
            db.execute(text("DELETE FROM linked_accounts WHERE user_id = :u"), {"u": user_id})
            db.commit()


def _upload(c: TestClient, csv: str = _CSV) -> dict:
    return c.post(
        "/api/import/apple-card",
        files={"file": ("apple.csv", csv, "text/csv")},
    ).json()


def _count(sql: str, uid: uuid.UUID) -> int:
    with admin_session() as db:
        return db.execute(text(sql), {"u": uid}).scalar_one()


def test_import_creates_purchases_skips_payments(client) -> None:
    c, uid = client
    body = _upload(c)
    assert body == {"imported": 2, "needs_review": 0, "duplicates": 0, "skipped": 1}
    assert _count("SELECT count(*) FROM transactions WHERE user_id=:u", uid) == 2
    # An Apple Card connected-account was created and rows attached to it.
    assert (
        _count("SELECT count(*) FROM linked_accounts WHERE user_id=:u AND is_apple_card", uid) == 1
    )


def test_reupload_is_idempotent(client) -> None:
    c, uid = client
    _upload(c)
    again = _upload(c)
    assert again["imported"] == 0 and again["duplicates"] == 2
    assert _count("SELECT count(*) FROM transactions WHERE user_id=:u", uid) == 2


def test_import_matching_existing_entry_goes_to_review_queue(client) -> None:
    c, uid = client
    # A hand-entered Kroger purchase the CSV's Kroger row will match.
    c.post(
        "/api/ingest",
        json={
            "source": "manual",
            "vendor": "Kroger",
            "purchased_on": "2026-07-02",
            "total_cents": 1248,
            "line_items": [{"raw_name": "milk", "price_cents": 1248}],
        },
    )
    body = _upload(c)
    # Apple → imported; Kroger → matched → queued; payment → skipped.
    assert body["imported"] == 1
    assert body["needs_review"] == 1
    assert len(c.get("/api/reviews").json()) == 1
