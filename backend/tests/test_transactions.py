"""Transaction read/edit/delete endpoints — GET/PATCH/DELETE on a transaction, and PATCH/
DELETE on one of its line items. Integration tests against a real Postgres (RLS applies).

Also closes two pre-existing coverage gaps (GET-by-id, DELETE transaction) while adding the
new edit endpoints — see the route-inventory guard.
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
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying migrations.",
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


def _seed_categories(uid: uuid.UUID) -> None:
    with admin_session() as db:
        db.execute(text("SELECT seed_default_categories(cast(:u as uuid))"), {"u": str(uid)})
        db.commit()


def _category_id(uid: uuid.UUID, name: str) -> str:
    with admin_session() as db:
        return str(
            db.execute(
                text("SELECT id FROM categories WHERE user_id = :u AND name = :n"),
                {"u": uid, "n": name},
            ).scalar_one()
        )


def _itemized_payload(**overrides) -> dict:
    payload = {
        "source": "manual",
        "vendor": "Corner Store",
        "purchased_on": "2026-07-10",
        "subtotal_cents": 800,
        "tax_cents": 50,
        "tip_cents": 0,
        "total_cents": 850,
        "line_items": [
            {"raw_name": "Coffee", "price_cents": 500},
            {"raw_name": "Bagel", "price_cents": 300},
        ],
    }
    payload.update(overrides)
    return payload


def _create(c: TestClient, **overrides) -> dict:
    return c.post("/api/ingest", json=_itemized_payload(**overrides)).json()["transaction"]


# --- GET -----------------------------------------------------------------------------------


def test_get_transaction_returns_items_in_order(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)

    body = c.get(f"/api/transactions/{txn['id']}").json()
    assert body["vendor"] == "Corner Store"
    assert [li["raw_name"] for li in body["line_items"]] == ["Coffee", "Bagel"]
    assert body["total_cents"] == 850


def test_get_transaction_404_for_unknown_id(client) -> None:
    # Cross-user isolation itself is the RLS smoke test's job; this just confirms a
    # nonexistent/inaccessible id 404s rather than 500ing.
    c, _uid = client
    assert c.get(f"/api/transactions/{uuid.uuid4()}").status_code == 404


# --- PATCH transaction -----------------------------------------------------------------


def test_update_transaction_vendor_and_date(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)

    resp = c.patch(
        f"/api/transactions/{txn['id']}",
        json={
            "vendor": "Corner Store #2",
            "purchased_on": "2026-07-11",
            "tax_cents": 50,
            "tip_cents": 0,
        },
    )
    body = resp.json()
    assert resp.status_code == 200
    assert body["vendor"] == "Corner Store #2"
    assert body["purchased_on"] == "2026-07-11"


def test_update_transaction_tax_tip_recomputes_total_when_itemized(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)  # subtotal 800, tax 50, tip 0 -> total 850

    body = c.patch(
        f"/api/transactions/{txn['id']}",
        json={
            "vendor": "Corner Store",
            "purchased_on": "2026-07-10",
            "tax_cents": 60,
            "tip_cents": 100,
        },
    ).json()
    assert body["tax_cents"] == 60
    assert body["tip_cents"] == 100
    assert body["total_cents"] == 800 + 60 + 100


def test_update_transaction_leaves_total_alone_when_unitemized(client) -> None:
    c, uid = client
    _seed_categories(uid)
    # A bank-style transaction with no line items at all: total is the source of truth.
    txn = c.post(
        "/api/ingest",
        json={
            "source": "manual",
            "vendor": "ATM Withdrawal",
            "purchased_on": "2026-07-10",
            "total_cents": 4000,
            "line_items": [],
        },
    ).json()["transaction"]
    assert c.get(f"/api/transactions/{txn['id']}").json()["subtotal_cents"] is None

    body = c.patch(
        f"/api/transactions/{txn['id']}",
        json={
            "vendor": "ATM Withdrawal",
            "purchased_on": "2026-07-12",
            "tax_cents": 999,
            "tip_cents": 999,
        },
    ).json()
    assert body["vendor"] == "ATM Withdrawal"
    assert body["purchased_on"] == "2026-07-12"
    assert body["total_cents"] == 4000  # untouched — tax/tip ignored for unitemized rows
    assert body["tax_cents"] == 0
    assert body["tip_cents"] == 0


def test_update_transaction_rejects_blank_vendor(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    resp = c.patch(
        f"/api/transactions/{txn['id']}",
        json={"vendor": "   ", "purchased_on": "2026-07-10", "tax_cents": 0, "tip_cents": 0},
    )
    assert resp.status_code == 400


# --- PATCH / DELETE line item -----------------------------------------------------------


def test_update_line_item_renames_recategorizes_and_reprices(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    detail = c.get(f"/api/transactions/{txn['id']}").json()
    item_id = detail["line_items"][0]["id"]
    health_id = _category_id(uid, "Health")

    body = c.patch(
        f"/api/transactions/{txn['id']}/items/{item_id}",
        json={"normalized_name": "Advil", "category_id": health_id, "price_cents": 650},
    ).json()
    updated = next(li for li in body["line_items"] if li["id"] == item_id)
    assert updated["normalized_name"] == "Advil"
    assert updated["category_name"] == "Health"
    assert updated["price_cents"] == 650
    # Subtotal/total re-summed: 650 (edited) + 300 (bagel, untouched) + tax 50.
    assert body["subtotal_cents"] == 950
    assert body["total_cents"] == 1000


def test_update_line_item_rejects_unknown_category(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    item_id = c.get(f"/api/transactions/{txn['id']}").json()["line_items"][0]["id"]

    resp = c.patch(
        f"/api/transactions/{txn['id']}/items/{item_id}",
        json={"normalized_name": "X", "category_id": str(uuid.uuid4()), "price_cents": 100},
    )
    assert resp.status_code == 400


def test_update_line_item_404_for_item_on_another_transaction(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn_a = _create(c, vendor="Store A")
    txn_b = _create(c, vendor="Store B")
    item_from_b = c.get(f"/api/transactions/{txn_b['id']}").json()["line_items"][0]["id"]

    resp = c.patch(
        f"/api/transactions/{txn_a['id']}/items/{item_from_b}",
        json={"normalized_name": "X", "category_id": None, "price_cents": 100},
    )
    assert resp.status_code == 404


def test_delete_line_item_resums_total(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    coffee_id = c.get(f"/api/transactions/{txn['id']}").json()["line_items"][0]["id"]

    body = c.delete(f"/api/transactions/{txn['id']}/items/{coffee_id}").json()
    assert len(body["line_items"]) == 1
    assert body["line_items"][0]["raw_name"] == "Bagel"
    assert body["subtotal_cents"] == 300
    assert body["total_cents"] == 300 + 50  # bagel + tax


def test_delete_last_line_item_leaves_transaction_with_zero_items(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(
        c,
        line_items=[{"raw_name": "Only item", "price_cents": 500}],
        subtotal_cents=500,
        tax_cents=0,  # _itemized_payload defaults tax to 50 — zero it so total==0 is provable
        total_cents=500,
    )
    item_id = c.get(f"/api/transactions/{txn['id']}").json()["line_items"][0]["id"]

    body = c.delete(f"/api/transactions/{txn['id']}/items/{item_id}").json()
    assert body["line_items"] == []
    assert body["subtotal_cents"] == 0
    assert body["total_cents"] == 0
    # The transaction itself still exists (only the item was removed).
    assert c.get(f"/api/transactions/{txn['id']}").status_code == 200


# --- Hide / unhide a line item --------------------------------------------------------


def test_hide_line_item_excludes_it_from_totals_but_keeps_it_listed(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)  # Coffee 500 + Bagel 300, tax 50 -> subtotal 800, total 850
    coffee_id = c.get(f"/api/transactions/{txn['id']}").json()["line_items"][0]["id"]

    body = c.post(
        f"/api/transactions/{txn['id']}/items/{coffee_id}/hide", json={"hidden": True}
    ).json()
    # Still present in the item list...
    assert [li["raw_name"] for li in body["line_items"]] == ["Coffee", "Bagel"]
    hidden_item = next(li for li in body["line_items"] if li["id"] == coffee_id)
    assert hidden_item["hidden"] is True
    # ...but excluded from the money: only the bagel (300) + tax (50) counts.
    assert body["subtotal_cents"] == 300
    assert body["total_cents"] == 350


def test_unhide_line_item_restores_it_to_totals(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    coffee_id = c.get(f"/api/transactions/{txn['id']}").json()["line_items"][0]["id"]
    c.post(f"/api/transactions/{txn['id']}/items/{coffee_id}/hide", json={"hidden": True})

    body = c.post(
        f"/api/transactions/{txn['id']}/items/{coffee_id}/hide", json={"hidden": False}
    ).json()
    assert next(li for li in body["line_items"] if li["id"] == coffee_id)["hidden"] is False
    assert body["subtotal_cents"] == 800
    assert body["total_cents"] == 850


def test_hide_all_items_zeroes_subtotal_without_falling_back_to_full_total(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    items = c.get(f"/api/transactions/{txn['id']}").json()["line_items"]

    for li in items:
        c.post(f"/api/transactions/{txn['id']}/items/{li['id']}/hide", json={"hidden": True})

    body = c.get(f"/api/transactions/{txn['id']}").json()
    assert len(body["line_items"]) == 2  # both still listed
    assert all(li["hidden"] for li in body["line_items"])
    assert body["subtotal_cents"] == 0
    assert body["total_cents"] == 50  # tax only — NOT the original 850


def test_hide_line_item_404_for_item_on_another_transaction(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn_a = _create(c, vendor="Store A")
    txn_b = _create(c, vendor="Store B")
    item_from_b = c.get(f"/api/transactions/{txn_b['id']}").json()["line_items"][0]["id"]

    resp = c.post(
        f"/api/transactions/{txn_a['id']}/items/{item_from_b}/hide", json={"hidden": True}
    )
    assert resp.status_code == 404


def test_insights_spending_excludes_hidden_item_from_its_category(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    coffee_id = c.get(f"/api/transactions/{txn['id']}").json()["line_items"][0]["id"]

    before = c.get("/api/insights/spending?start=2026-07-01&end=2026-07-31").json()
    before_total = before["total_cents"]

    c.post(f"/api/transactions/{txn['id']}/items/{coffee_id}/hide", json={"hidden": True})

    after = c.get("/api/insights/spending?start=2026-07-01&end=2026-07-31").json()
    # The hidden coffee's 500 cents drop out of the aggregate entirely — not just moved.
    assert after["total_cents"] == before_total - 500


# --- Hide / unhide a whole transaction ----------------------------------------------------


def test_hide_transaction_keeps_totals_and_list_presence(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)

    body = c.post(f"/api/transactions/{txn['id']}/hide", json={"hidden": True}).json()
    assert body["hidden"] is True
    # Money columns are a charting flag only — not rewritten.
    assert body["subtotal_cents"] == 800
    assert body["total_cents"] == 850
    # Still listed in the ledger.
    listed = c.get("/api/transactions").json()
    assert any(t["id"] == txn["id"] and t["hidden"] is True for t in listed)


def test_unhide_transaction_restores_chart_eligibility(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)
    c.post(f"/api/transactions/{txn['id']}/hide", json={"hidden": True})

    body = c.post(f"/api/transactions/{txn['id']}/hide", json={"hidden": False}).json()
    assert body["hidden"] is False


def test_insights_spending_excludes_hidden_transaction_entirely(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)

    before = c.get("/api/insights/spending?start=2026-07-01&end=2026-07-31").json()
    assert before["total_cents"] == 850  # 500 + 300 + tax 50

    c.post(f"/api/transactions/{txn['id']}/hide", json={"hidden": True})

    after = c.get("/api/insights/spending?start=2026-07-01&end=2026-07-31").json()
    # Whole purchase drops out — items, tax, everything — not just one category.
    assert after["total_cents"] == 0
    assert after["slices"] == []


def test_hide_transaction_404_for_unknown_id(client) -> None:
    c, _uid = client
    resp = c.post(f"/api/transactions/{uuid.uuid4()}/hide", json={"hidden": True})
    assert resp.status_code == 404


# --- DELETE transaction ------------------------------------------------------------------


def test_delete_transaction_cascades_line_items(client) -> None:
    c, uid = client
    _seed_categories(uid)
    txn = _create(c)

    resp = c.delete(f"/api/transactions/{txn['id']}")
    assert resp.status_code == 204
    assert c.get(f"/api/transactions/{txn['id']}").status_code == 404


def test_delete_transaction_404_for_unknown_id(client) -> None:
    c, _uid = client
    resp = c.delete(f"/api/transactions/{uuid.uuid4()}")
    assert resp.status_code == 404
