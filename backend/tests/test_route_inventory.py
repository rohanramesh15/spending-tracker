"""Route-inventory guard — the enforcement behind "every feature ships with a regression
test" (CLAUDE.md).

It introspects the LIVE FastAPI app and asserts every API route is accounted for: either
in ``TESTED`` (a real test exercises it) or in ``KNOWN_UNTESTED`` (a shrink-only backlog of
pre-existing gaps from the coverage audit). A **new** route with no test — added by some
future feature — lands in neither set and fails this test, so it can't merge without
someone either writing the test (preferred) or explicitly, visibly acknowledging the gap.

Rules for changing the sets below:
- Add an endpoint  → add a real test and put it in TESTED (don't park it in KNOWN_UNTESTED).
- Write a test for a backlog route → MOVE it from KNOWN_UNTESTED to TESTED.
- Never grow KNOWN_UNTESTED. ``test_backlog_never_grows`` enforces the ceiling.
"""

from __future__ import annotations

from app.main import app

_VERBS = {"get", "post", "put", "patch", "delete"}


def _api_routes() -> set[tuple[str, str]]:
    """The true public API surface, from the OpenAPI schema (version-proof: doesn't depend
    on how FastAPI stores included routers). Excludes /openapi.json, /docs, /redoc."""
    routes: set[tuple[str, str]] = set()
    for path, ops in app.openapi().get("paths", {}).items():
        for method in ops:
            if method.lower() in _VERBS:
                routes.add((method.upper(), path))
    return routes


# Routes with a real test exercising them (unit or integration, incl. gated-on-Postgres).
TESTED: set[tuple[str, str]] = {
    ("GET", "/healthz"),
    ("POST", "/api/ingest"),
    ("POST", "/api/plaid/webhook"),
    ("POST", "/api/import/apple-card"),
    ("GET", "/api/reviews"),
    ("POST", "/api/reviews/{review_id}/resolve"),
    ("POST", "/api/plaid/exchange"),
    ("POST", "/api/plaid/sync"),
    ("GET", "/api/transactions"),
}

# Pre-existing coverage gaps (from the audit). SHRINK THIS as tests are added; never grow it.
KNOWN_UNTESTED: set[tuple[str, str]] = {
    ("GET", "/api/insights/spending"),
    ("GET", "/api/transactions/{transaction_id}"),
    ("DELETE", "/api/transactions/{transaction_id}"),
    ("GET", "/api/categories"),
    ("GET", "/api/plaid/accounts"),
    ("POST", "/api/plaid/link-token"),
    ("POST", "/api/plaid/link-token/update"),
    ("POST", "/api/plaid/accounts/{account_id}/reconnected"),
    ("POST", "/api/receipts/extract"),
}

# Frozen ceiling: the backlog may only shrink from here.
_INITIAL_BACKLOG_SIZE = 10


def test_every_route_is_accounted_for():
    routes = _api_routes()
    accounted = TESTED | KNOWN_UNTESTED
    new_untracked = routes - accounted
    assert not new_untracked, (
        "New API route(s) with no regression test and not acknowledged as a known gap: "
        f"{sorted(new_untracked)}. Per CLAUDE.md, add a test and put it in TESTED "
        "(preferred), or — only if you must — add it to KNOWN_UNTESTED with a follow-up."
    )
    stale = accounted - routes
    assert (
        not stale
    ), f"Inventory lists routes that no longer exist (clean these up): {sorted(stale)}"


def test_backlog_never_grows():
    assert len(KNOWN_UNTESTED) <= _INITIAL_BACKLOG_SIZE, (
        f"KNOWN_UNTESTED grew to {len(KNOWN_UNTESTED)} (ceiling {_INITIAL_BACKLOG_SIZE}). "
        "The backlog is shrink-only — write the test instead of parking the route."
    )
