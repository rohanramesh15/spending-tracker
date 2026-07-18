"""RLS smoke test (plan §10, CLAUDE.md #3) — MUST run in CI.

Proves Row-Level Security actually applies to Lambda-style queries. Covers:
- read isolation: as user A, see A's rows and ZERO of synthetic user B's;
- WITH CHECK: A cannot INSERT a row owned by B;
- ownership integrity: A cannot attach a child (line_item) to B's transaction
  (composite owner-scoped FK rejects it).

Mis-wired claims surface as silently *empty* results, so this is the canary. Skipped
automatically until a migrated Postgres is reachable via SUPABASE_DB_URL — run it
locally with the DB up, and always in CI.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.core.db import admin_session, engine, rls_session


def _schema_ready() -> bool:
    try:
        with engine.connect() as conn:
            return (
                conn.execute(text("SELECT to_regclass('public.transactions')")).scalar() is not None
            )
    except OperationalError:
        return False


pytestmark = pytest.mark.skipif(
    not _schema_ready(),
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying the migration.",
)


def _claims(user_id: uuid.UUID) -> dict:
    return {"sub": str(user_id), "role": "authenticated"}


@pytest.fixture
def two_users():
    """Seed one transaction + the taxonomy for two synthetic users (RLS-bypassing
    admin session), and clean everything up afterwards."""
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    ids: dict[str, uuid.UUID] = {}
    with admin_session() as db:
        for uid, vendor in ((user_a, "A-store"), (user_b, "B-store")):
            row = db.execute(
                text(
                    "INSERT INTO transactions "
                    "(user_id, vendor, purchased_on, source, total_cents, review_status) "
                    "VALUES (:uid, :vendor, CURRENT_DATE, 'manual', 100, 'confirmed') "
                    "RETURNING id"
                ),
                {"uid": uid, "vendor": vendor},
            )
            ids[str(uid)] = row.scalar_one()
            db.execute(text("SELECT public.seed_default_categories(:uid)"), {"uid": uid})
            # A stored subscription per user, to prove the subscriptions table is RLS'd too.
            sub_row = db.execute(
                text(
                    "INSERT INTO subscriptions "
                    "(user_id, merchant, display_name, amount_cents, cadence) "
                    "VALUES (:uid, :merchant, :merchant, 999, 'monthly') RETURNING id"
                ),
                {"uid": uid, "merchant": f"{vendor}-sub"},
            )
            sub_id = sub_row.scalar_one()
            # And a notification, to prove that table is RLS'd too.
            db.execute(
                text(
                    "INSERT INTO notifications "
                    "(user_id, kind, subscription_id, title, dedup_key) "
                    "VALUES (:uid, 'new', :sub, :title, :key)"
                ),
                {"uid": uid, "sub": sub_id, "title": f"{vendor}-notif", "key": f"new:{sub_id}"},
            )
        db.commit()
    try:
        yield user_a, user_b, ids
    finally:
        with admin_session() as db:
            for uid in (user_a, user_b):
                db.execute(text("DELETE FROM notifications WHERE user_id = :uid"), {"uid": uid})
                db.execute(text("DELETE FROM subscriptions WHERE user_id = :uid"), {"uid": uid})
                db.execute(text("DELETE FROM transactions WHERE user_id = :uid"), {"uid": uid})
                db.execute(text("DELETE FROM categories WHERE user_id = :uid"), {"uid": uid})
            db.commit()


def test_read_isolation(two_users) -> None:
    user_a, _user_b, _ids = two_users
    with rls_session(_claims(user_a)) as db:
        vendors = db.execute(text("SELECT vendor FROM transactions")).scalars().all()
        cat_owners = set(db.execute(text("SELECT DISTINCT user_id FROM categories")).scalars())
        sub_merchants = db.execute(text("SELECT merchant FROM subscriptions")).scalars().all()
        notif_titles = db.execute(text("SELECT title FROM notifications")).scalars().all()
    assert vendors == ["A-store"], f"RLS leak or misconfig: saw {vendors}"
    assert cat_owners == {user_a}, f"RLS leak in categories: saw owners {cat_owners}"
    assert sub_merchants == ["A-store-sub"], f"RLS leak in subscriptions: saw {sub_merchants}"
    assert notif_titles == ["A-store-notif"], f"RLS leak in notifications: saw {notif_titles}"


def test_with_check_blocks_foreign_insert(two_users) -> None:
    user_a, user_b, _ids = two_users
    # As A, try to insert a transaction owned by B — RLS WITH CHECK must reject it.
    with pytest.raises(SQLAlchemyError):
        with rls_session(_claims(user_a)) as db:
            db.execute(
                text(
                    "INSERT INTO transactions "
                    "(user_id, vendor, purchased_on, source, total_cents, review_status) "
                    "VALUES (:uid, 'sneaky', CURRENT_DATE, 'manual', 1, 'confirmed')"
                ),
                {"uid": user_b},
            )


def test_cannot_attach_child_to_other_users_transaction(two_users) -> None:
    user_a, user_b, ids = two_users
    b_txn = ids[str(user_b)]
    # As A, try to attach a line_item to B's transaction. The composite owner-scoped
    # FK (user_id, transaction_id) -> transactions(user_id, id) has no matching row.
    with pytest.raises(SQLAlchemyError):
        with rls_session(_claims(user_a)) as db:
            db.execute(
                text(
                    "INSERT INTO line_items "
                    "(user_id, transaction_id, raw_name, price_cents) "
                    "VALUES (:uid, :txn, 'x', 1)"
                ),
                {"uid": user_a, "txn": b_txn},
            )
