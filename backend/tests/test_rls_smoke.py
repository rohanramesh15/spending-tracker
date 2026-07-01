"""RLS smoke test (plan §10, CLAUDE.md #3) — MUST run in CI.

Proves Row-Level Security actually applies to Lambda-style queries: with the JWT
claims for user A set on the session, a query sees A's rows and ZERO of synthetic
user B's. Mis-wired claims surface as silently *empty* results, so this is the
canary. Skipped automatically until a real Postgres with the migration applied is
reachable via SUPABASE_DB_URL — run it locally with the DB up and always in CI.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.db import admin_session, engine, rls_session


def _schema_ready() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT to_regclass('public.transactions')")).scalar_one()
            row = conn.execute(text("SELECT to_regclass('public.transactions')")).scalar()
            return row is not None
    except OperationalError:
        return False


pytestmark = pytest.mark.skipif(
    not _schema_ready(),
    reason="No migrated Postgres reachable via SUPABASE_DB_URL; run after applying the migration.",
)


def _claims(user_id: uuid.UUID) -> dict:
    return {"sub": str(user_id), "role": "authenticated"}


def test_rls_isolates_users() -> None:
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()

    # Seed one transaction for each user with the RLS-bypassing admin session.
    with admin_session() as db:
        for uid, vendor in ((user_a, "A-store"), (user_b, "B-store")):
            db.execute(
                text(
                    "INSERT INTO transactions "
                    "(user_id, vendor, purchased_on, source, total_cents, review_status) "
                    "VALUES (:uid, :vendor, CURRENT_DATE, 'manual', 100, 'confirmed')"
                ),
                {"uid": uid, "vendor": vendor},
            )
        db.commit()

    try:
        # As user A, RLS must expose exactly A's row and none of B's.
        with rls_session(_claims(user_a)) as db:
            rows = db.execute(text("SELECT vendor FROM transactions")).scalars().all()
        assert rows == ["A-store"], f"RLS leak or misconfig: saw {rows}"
    finally:
        with admin_session() as db:
            db.execute(
                text("DELETE FROM transactions WHERE user_id IN (:a, :b)"),
                {"a": user_a, "b": user_b},
            )
            db.commit()
