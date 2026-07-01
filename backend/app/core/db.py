"""Database engine and the per-request RLS wiring.

Two non-negotiables from the plan (§4 "DB connections from Lambda", §7 security):

1. Connect through Supabase's Supavisor transaction pooler (port 6543) with
   SQLAlchemy ``NullPool`` — many short-lived Lambda invocations would exhaust a
   client-side pool or direct Postgres connections. Let the pooler pool.

2. Row-Level Security is enforced *for real*. Every request opens a transaction and
   sets the verified Supabase JWT's claims on that transaction
   (``role = authenticated`` + ``request.jwt.claims = <json>``) via ``set_config(...,
   is_local => true)`` — the parameterized, injection-safe equivalent of ``SET LOCAL``.
   Postgres RLS policies (and Supabase's ``auth.uid()``) then read ``sub`` from those
   claims, so policies actually apply to Lambda queries. Debugging note: mis-set claims
   surface as silently *empty* results, not errors.

We never use a service-role / RLS-bypassing connection for user-data queries.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlmodel import Session

from app.core.config import get_settings

_settings = get_settings()

# NullPool + Supavisor: one connection per invocation, handed straight back.
engine = create_engine(
    _settings.supabase_db_url,
    poolclass=NullPool,
    pool_pre_ping=True,
    future=True,
)


@contextmanager
def rls_session(claims: dict) -> Iterator[Session]:
    """Yield a Session inside a transaction with the JWT claims applied for RLS.

    ``claims`` must be the *verified* JWT payload (see app.core.auth). The role and
    claims are scoped with ``is_local => true`` so they last exactly for this
    transaction and never leak to the next pooled use of the connection.
    """
    with Session(engine) as session:
        with session.begin():
            _apply_claims(session, claims)
            yield session
        # session.begin() commits on clean exit, rolls back on exception.


def _apply_claims(session: Session, claims: dict) -> None:
    role = claims.get("role", "authenticated")
    session.exec(  # type: ignore[call-overload]
        text("SELECT set_config('role', :role, true)"),
        params={"role": role},
    )
    session.exec(  # type: ignore[call-overload]
        text("SELECT set_config('request.jwt.claims', :claims, true)"),
        params={"claims": json.dumps(claims)},
    )


@contextmanager
def admin_session() -> Iterator[Session]:
    """A plain session with NO RLS claims set — for migrations, seeding, and the
    RLS smoke test's setup only. Must never serve a user request path."""
    with Session(engine) as session:
        yield session
