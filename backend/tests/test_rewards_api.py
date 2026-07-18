"""Integration tests for the rewards optimizer API (rewards-optimizer-plan §3, v1).

Covers card creation on Plaid sync (get_accounts mocked — no network), the cards endpoints,
the reward-profile catalog, and the optimization endpoint. Needs a migrated Postgres (same
gate as the RLS smoke test).
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
            return conn.execute(text("SELECT to_regclass('public.cards')")).scalar() is not None
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(
    not _schema_ready(),
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying migrations.",
)


@pytest.fixture
def client(monkeypatch) -> Iterator[tuple[TestClient, uuid.UUID, str]]:
    user_id = uuid.uuid4()
    claims = {"sub": str(user_id), "role": "authenticated"}

    def _override_db() -> Iterator[object]:
        with rls_session(claims) as session:
            yield session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[current_user_id] = lambda: str(user_id)
    monkeypatch.setattr(plaid_client, "is_configured", lambda: True)

    with admin_session() as db:
        acct_id = db.execute(
            text(
                "INSERT INTO linked_accounts "
                "(user_id, institution, source, item_id, access_token, status) "
                "VALUES (:u, 'Test Bank', 'plaid', 'item-1', 'tok-1', 'active') RETURNING id"
            ),
            {"u": user_id},
        ).scalar_one()
        db.commit()
    try:
        yield TestClient(app), user_id, str(acct_id)
    finally:
        app.dependency_overrides.clear()
        with admin_session() as db:
            db.execute(text("DELETE FROM cards WHERE user_id = :u"), {"u": user_id})
            db.execute(text("DELETE FROM transactions WHERE user_id = :u"), {"u": user_id})
            db.execute(text("DELETE FROM linked_accounts WHERE user_id = :u"), {"u": user_id})
            db.execute(text("DELETE FROM reward_profiles"))  # global cache — clear between tests
            db.commit()


def _seed_card(
    user_id, acct_id, *, plaid_account_id, name, subtype, profile_key=None, source=None
) -> str:
    with admin_session() as db:
        cid = db.execute(
            text(
                "INSERT INTO cards (user_id, linked_account_id, plaid_account_id, name, subtype, "
                "reward_profile_key, reward_profile_source) "
                "VALUES (:u, :a, :pa, :n, :st, :k, :src) RETURNING id"
            ),
            {
                "u": user_id,
                "a": acct_id,
                "pa": plaid_account_id,
                "n": name,
                "st": subtype,
                "k": profile_key,
                "src": source,
            },
        ).scalar_one()
        db.commit()
    return str(cid)


def _seed_plaid_txn(
    user_id,
    vendor,
    cents,
    *,
    review_status="confirmed",
    card_id=None,
    pfc_detailed=None,
    external_id=None,
):
    with admin_session() as db:
        db.execute(
            text(
                "INSERT INTO transactions "
                "(user_id, vendor, purchased_on, source, total_cents, review_status, "
                "card_id, pfc_detailed, external_id) "
                "VALUES (:u, :v, CURRENT_DATE, 'plaid', :c, :rs, :cid, :pfc, :ext)"
            ),
            {
                "u": user_id,
                "v": vendor,
                "c": cents,
                "rs": review_status,
                "cid": card_id,
                "pfc": pfc_detailed,
                "ext": external_id,
            },
        )
        db.commit()


def _plaid_txn(tid, account_id, name, cents, *, pfc_detailed=None):
    return {
        "transaction_id": tid,
        "account_id": account_id,
        "name": name,
        "amount_cents": cents,
        "currency": "USD",
        "purchased_on": date.today(),
        "pending": False,
        "pfc_primary": "FOOD_AND_DRINK",
        "pfc_detailed": pfc_detailed,
    }


# --- cards endpoints ---------------------------------------------------------------------
def test_list_cards_empty(client):
    c, _uid, _acct = client
    assert c.get("/api/cards").json() == []


def test_sync_creates_and_matches_cards(client, monkeypatch):
    c, uid, _acct = client
    monkeypatch.setattr(
        plaid_client,
        "sync_transactions",
        lambda at, cur: {
            "added": [],
            "modified": [],
            "removed": [],
            "next_cursor": "cur-1",
        },
    )
    monkeypatch.setattr(
        plaid_client,
        "get_accounts",
        lambda at: [
            {
                "account_id": "ac_bce",
                "name": "Blue Cash Everyday",
                "official_name": None,
                "mask": "1111",
                "subtype": "credit card",
                "type": "credit",
            },
            {
                "account_id": "ac_chk",
                "name": "Everyday Checking",
                "official_name": None,
                "mask": "2222",
                "subtype": "checking",
                "type": "depository",
            },
            {
                "account_id": "ac_unknown",
                "name": "Mystery Rewards Visa",
                "official_name": None,
                "mask": "3333",
                "subtype": "credit card",
                "type": "credit",
            },
        ],
    )
    c.post("/api/plaid/sync")
    cards = {card["name"]: card for card in c.get("/api/cards").json()}
    assert len(cards) == 3
    # Known credit card → matched to the seed profile automatically.
    assert cards["Blue Cash Everyday"]["reward_profile_key"] == "amex_blue_cash_everyday"
    assert cards["Blue Cash Everyday"]["reward_profile_source"] == "matched"
    assert cards["Blue Cash Everyday"]["needs_confirmation"] is False
    # Unknown credit card → no match, flagged for user confirmation.
    assert cards["Mystery Rewards Visa"]["reward_profile_key"] is None
    assert cards["Mystery Rewards Visa"]["needs_confirmation"] is True
    # A checking account is a card row but never nags for a reward profile.
    assert cards["Everyday Checking"]["needs_confirmation"] is False


def test_sync_card_creation_is_idempotent(client, monkeypatch):
    c, uid, _acct = client
    monkeypatch.setattr(
        plaid_client,
        "sync_transactions",
        lambda at, cur: {
            "added": [],
            "modified": [],
            "removed": [],
            "next_cursor": "cur-1",
        },
    )
    monkeypatch.setattr(
        plaid_client,
        "get_accounts",
        lambda at: [
            {
                "account_id": "ac_bce",
                "name": "Blue Cash Everyday",
                "official_name": None,
                "mask": "1111",
                "subtype": "credit card",
                "type": "credit",
            },
        ],
    )
    c.post("/api/plaid/sync")
    c.post("/api/plaid/sync")
    assert len(c.get("/api/cards").json()) == 1


def test_set_card_profile(client):
    c, uid, acct = client
    _seed_card(uid, acct, plaid_account_id="ac_x", name="Mystery Visa", subtype="credit card")
    card_id = c.get("/api/cards").json()[0]["id"]

    # Bad key → 400; bad card id → 404.
    assert (
        c.post(f"/api/cards/{card_id}/profile", json={"reward_profile_key": "nope"}).status_code
        == 400
    )
    assert (
        c.post(
            f"/api/cards/{uuid.uuid4()}/profile", json={"reward_profile_key": "citi_double_cash"}
        ).status_code
        == 404
    )

    resp = c.post(f"/api/cards/{card_id}/profile", json={"reward_profile_key": "citi_double_cash"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reward_profile_key"] == "citi_double_cash"
    assert body["reward_profile_source"] == "user"
    assert body["reward_profile_name"] == "Citi Double Cash"
    assert body["needs_confirmation"] is False


# --- rewards endpoints -------------------------------------------------------------------
def test_reward_profiles_catalog(client):
    c, _uid, _acct = client
    keys = {p["key"] for p in c.get("/api/rewards/profiles").json()}
    assert {"amex_blue_cash_everyday", "chase_freedom_unlimited", "citi_double_cash"} <= keys


def test_optimization_picks_best_card_and_notes(client):
    c, uid, acct = client
    _seed_card(
        uid,
        acct,
        plaid_account_id="ac_bce",
        name="Blue Cash Everyday",
        subtype="credit card",
        profile_key="amex_blue_cash_everyday",
        source="matched",
    )
    _seed_card(
        uid,
        acct,
        plaid_account_id="ac_cfu",
        name="Freedom Unlimited",
        subtype="credit card",
        profile_key="chase_freedom_unlimited",
        source="matched",
    )
    _seed_card(
        uid, acct, plaid_account_id="ac_mystery", name="Mystery Visa", subtype="credit card"
    )  # unmatched → should count as needing confirmation
    _seed_plaid_txn(uid, "Whole Foods Market", 20_000)  # groceries
    _seed_plaid_txn(uid, "Chipotle", 5_000)  # dining

    body = c.get("/api/rewards/optimization?window_days=90").json()
    recos = {r["reward_category"]: r for r in body["recommendations"]}
    assert recos["groceries"]["best_card_key"] == "amex_blue_cash_everyday"
    assert recos["dining"]["best_card_key"] == "chase_freedom_unlimited"
    assert body["unmatched_card_count"] == 1
    assert body["top_move"] is not None
    assert "1¢" in body["points_assumption_note"]
    assert body["total_est_annual_reward_cents"] > 0


def test_optimization_excludes_needs_review(client):
    c, uid, acct = client
    _seed_card(
        uid,
        acct,
        plaid_account_id="ac_bce",
        name="Blue Cash Everyday",
        subtype="credit card",
        profile_key="amex_blue_cash_everyday",
        source="matched",
    )
    _seed_plaid_txn(uid, "Whole Foods Market", 20_000, review_status="needs_review")
    body = c.get("/api/rewards/optimization?window_days=90").json()
    assert body["recommendations"] == []  # the only spend was needs_review → excluded


def test_optimization_empty_wallet(client):
    c, _uid, _acct = client
    body = c.get("/api/rewards/optimization").json()
    assert body["recommendations"] == []
    assert body["total_est_annual_reward_cents"] == 0
    assert body["top_move"] is None
    assert body["total_missed_annual_cents"] is None  # no card-attributed spend yet


# --- v2: card attribution + missed rewards + backfill -----------------------------------
def test_sync_attributes_card_id_and_pfc(client, monkeypatch):
    c, uid, _acct = client
    monkeypatch.setattr(
        plaid_client,
        "get_accounts",
        lambda at: [
            {
                "account_id": "ac_bce",
                "name": "Blue Cash Everyday",
                "official_name": None,
                "mask": "1111",
                "subtype": "credit card",
                "type": "credit",
            },
        ],
    )
    monkeypatch.setattr(
        plaid_client,
        "sync_transactions",
        lambda at, cur: {
            "added": [
                _plaid_txn(
                    "t1", "ac_bce", "Whole Foods", 5000, pfc_detailed="FOOD_AND_DRINK_GROCERIES"
                )
            ],
            "modified": [],
            "removed": [],
            "next_cursor": "cur-1",
        },
    )
    c.post("/api/plaid/sync")
    with admin_session() as db:
        row = db.execute(
            text(
                "SELECT card_id, pfc_detailed FROM transactions "
                "WHERE user_id=:u AND external_id='t1'"
            ),
            {"u": uid},
        ).first()
    assert row.card_id is not None  # attributed to the BCE card
    assert row.pfc_detailed == "FOOD_AND_DRINK_GROCERIES"


def test_resync_backfills_card_id_on_existing_row(client, monkeypatch):
    c, uid, _acct = client
    # A pre-existing Plaid row with no card_id (as if it predates the rewards feature).
    _seed_plaid_txn(uid, "Whole Foods", 5000, external_id="t1")
    monkeypatch.setattr(
        plaid_client,
        "get_accounts",
        lambda at: [
            {
                "account_id": "ac_bce",
                "name": "Blue Cash Everyday",
                "official_name": None,
                "mask": "1111",
                "subtype": "credit card",
                "type": "credit",
            },
        ],
    )
    monkeypatch.setattr(
        plaid_client,
        "sync_transactions",
        lambda at, cur: {
            "added": [
                _plaid_txn(
                    "t1", "ac_bce", "Whole Foods", 5000, pfc_detailed="FOOD_AND_DRINK_GROCERIES"
                )
            ],
            "modified": [],
            "removed": [],
            "next_cursor": "cur-1",
        },
    )
    c.post("/api/plaid/sync")  # redelivers t1 with account_id → ingest backfills card_id/pfc
    with admin_session() as db:
        row = db.execute(
            text(
                "SELECT card_id, pfc_detailed FROM transactions "
                "WHERE user_id=:u AND external_id='t1'"
            ),
            {"u": uid},
        ).first()
    assert row.card_id is not None
    assert row.pfc_detailed == "FOOD_AND_DRINK_GROCERIES"


def test_optimization_shows_missed_on_suboptimal_card(client):
    c, uid, acct = client
    _seed_card(
        uid,
        acct,
        plaid_account_id="ac_bce",
        name="Blue Cash Everyday",
        subtype="credit card",
        profile_key="amex_blue_cash_everyday",
        source="matched",
    )
    dc_id = _seed_card(
        uid,
        acct,
        plaid_account_id="ac_dc",
        name="Double Cash",
        subtype="credit card",
        profile_key="citi_double_cash",
        source="matched",
    )
    # $500 groceries put on Double Cash (2%) though Blue Cash Everyday (3%) is held → missed.
    _seed_plaid_txn(uid, "Whole Foods Market", 50_000, card_id=dc_id)

    body = c.get("/api/rewards/optimization?window_days=90").json()
    assert body["total_missed_annual_cents"] is not None
    assert body["total_missed_annual_cents"] > 0
    groceries = next(r for r in body["recommendations"] if r["reward_category"] == "groceries")
    assert groceries["best_card_key"] == "amex_blue_cash_everyday"
    assert groceries["current_card_name"] == "Citi Double Cash"
    assert groceries["est_annual_missed_cents"] > 0
    assert "leaving" in body["top_move"]


def test_worker_dispatches_rewards_backfill(monkeypatch):
    from app import worker
    from app.api import plaid as plaid_api

    monkeypatch.setattr(plaid_api, "backfill_transaction_cards", lambda: 3)
    result = worker.handler({"job": "rewards_backfill"})
    assert result == {"job": "rewards_backfill", "synced": 3}


# --- v3: reward-rate refresh (uncommon cards, mock the Tavily fetch) ---------------------
def test_reward_refresh_matches_and_caches_uncommon_card(client, monkeypatch):
    c, uid, acct = client
    from app.services import reward_refresh

    _seed_card(
        uid, acct, plaid_account_id="ac_obscure", name="Obscure Rewards Card", subtype="credit card"
    )  # not in the seed → unmatched
    fetched = {
        "key": "obscure_rewards_card",
        "display_name": "Obscure Rewards Card",
        "issuer": "Obscure Bank",
        "base_rate": 0.01,
        "category_rates": {"dining": 0.04},
        "category_caps": {},
        "points_value_cents": 1.0,
        "source": "tavily",
    }
    monkeypatch.setattr(reward_refresh, "is_configured", lambda: True)
    monkeypatch.setattr(reward_refresh, "fetch_reward_profile", lambda name: fetched)

    assert reward_refresh.refresh_unmatched_cards() >= 1
    # The card is now matched to the fetched (cached) profile, sourced 'tavily'.
    card = next(x for x in c.get("/api/cards").json() if x["name"] == "Obscure Rewards Card")
    assert card["reward_profile_key"] == "obscure_rewards_card"
    assert card["reward_profile_source"] == "tavily"
    assert card["reward_profile_name"] == "Obscure Rewards Card"
    # And it participates in optimization via the cache (4% dining).
    _seed_plaid_txn(uid, "Chipotle", 30_000)
    body = c.get("/api/rewards/optimization?window_days=90").json()
    dining = next(r for r in body["recommendations"] if r["reward_category"] == "dining")
    assert dining["best_card_key"] == "obscure_rewards_card"


def test_worker_dispatches_reward_profiles_refresh(monkeypatch):
    from app import worker
    from app.services import reward_refresh

    monkeypatch.setattr(reward_refresh, "refresh_unmatched_cards", lambda: 2)
    result = worker.handler({"job": "reward_profiles_refresh"})
    assert result == {"job": "reward_profiles_refresh", "assigned": 2}
