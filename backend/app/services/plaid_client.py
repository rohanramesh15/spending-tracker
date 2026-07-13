"""Plaid client seam (plan §6.7, Phase 3).

One module owns the Plaid SDK; the rest of the app never imports ``plaid`` types
directly, so the provider stays swappable and Plaid types don't leak. (The "never say
Plaid" rule is about *UI labels* — backend module naming is fine.)

Sandbox while developing; real accounts are linked exactly once, at the end (the trial
plan's 10-Item cap is lifetime — CLAUDE.md). If the keys are unset, ``is_configured()``
is False and the bank-sync endpoints return a clean "not configured" rather than failing.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache

from app.core.config import get_settings


def is_configured() -> bool:
    s = get_settings()
    return bool(s.plaid_client_id and s.plaid_secret)


@lru_cache
def _client():
    import plaid
    from plaid.api import plaid_api

    s = get_settings()
    hosts = {
        "sandbox": plaid.Environment.Sandbox,
        "production": plaid.Environment.Production,
    }
    config = plaid.Configuration(
        host=hosts.get(s.plaid_env, plaid.Environment.Sandbox),
        api_key={"clientId": s.plaid_client_id, "secret": s.plaid_secret},
    )
    return plaid_api.PlaidApi(plaid.ApiClient(config))


def create_link_token(
    user_id: str, *, webhook: str | None = None, redirect_uri: str | None = None
) -> str:
    """A short-lived token the frontend hands to Plaid Link to start the connect flow.

    ``redirect_uri`` is required for OAuth institutions (most major US banks in
    production — Chase, BofA, Amex…): Plaid sends the user to the bank's site and back to
    this URL. It must be registered in the Plaid dashboard and match exactly.
    """
    from plaid.model.country_code import CountryCode
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
    from plaid.model.products import Products

    req = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=user_id),
        client_name="Spending Tracker",
        products=[Products("transactions")],
        country_codes=[CountryCode("US")],
        language="en",
        **({"webhook": webhook} if webhook else {}),
        **({"redirect_uri": redirect_uri} if redirect_uri else {}),
    )
    return _client().link_token_create(req).link_token


def create_update_link_token(
    user_id: str, access_token: str, *, redirect_uri: str | None = None
) -> str:
    """A Link token in **update mode** for an existing Item — reconnect a connection that
    needs reauth, and/or add newly-available accounts — WITHOUT creating a new Item (no
    extra trial Item consumed). Update mode carries no ``products``;
    ``account_selection_enabled`` lets the user add/adjust which accounts are shared.
    ``redirect_uri`` is still required for OAuth banks (Chase/BofA/Amex)."""
    from plaid.model.country_code import CountryCode
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_update import LinkTokenCreateRequestUpdate
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser

    req = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=user_id),
        client_name="Spending Tracker",
        country_codes=[CountryCode("US")],
        language="en",
        access_token=access_token,
        update=LinkTokenCreateRequestUpdate(account_selection_enabled=True),
        **({"redirect_uri": redirect_uri} if redirect_uri else {}),
    )
    return _client().link_token_create(req).link_token


def exchange_public_token(public_token: str) -> dict:
    """Trade the short-lived public_token (from Link) for the durable access_token + item_id."""
    from plaid.model.item_public_token_exchange_request import (
        ItemPublicTokenExchangeRequest,
    )

    resp = _client().item_public_token_exchange(
        ItemPublicTokenExchangeRequest(public_token=public_token)
    )
    return {"access_token": resp.access_token, "item_id": resp.item_id}


def get_institution_name(access_token: str) -> str:
    """Best-effort human name for the linked bank (for the 'Connected accounts' label)."""
    from plaid.model.country_code import CountryCode
    from plaid.model.institutions_get_by_id_request import InstitutionsGetByIdRequest
    from plaid.model.item_get_request import ItemGetRequest

    try:
        client = _client()
        item = client.item_get(ItemGetRequest(access_token=access_token))
        institution_id = item.item.institution_id
        if not institution_id:
            return "Bank"
        inst = client.institutions_get_by_id(
            InstitutionsGetByIdRequest(
                institution_id=institution_id, country_codes=[CountryCode("US")]
            )
        )
        return inst.institution.name or "Bank"
    except Exception:  # noqa: BLE001 - the label is cosmetic; never fail a link over it
        return "Bank"


def sync_transactions(access_token: str, cursor: str | None) -> dict:
    """Incremental ``/transactions/sync`` (plan §6.7), paginated to completion.

    Returns clean dicts (no Plaid types leak): ``added``/``modified`` line dicts, a list of
    removed ``transaction_id``s, and the ``next_cursor`` to persist for the next call.
    """
    from plaid.model.transactions_sync_request import TransactionsSyncRequest

    added: list[dict] = []
    modified: list[dict] = []
    removed: list[str] = []
    cur = cursor or ""

    while True:
        kwargs = {"access_token": access_token}
        if cur:
            kwargs["cursor"] = cur
        resp = _client().transactions_sync(TransactionsSyncRequest(**kwargs))
        added.extend(_txn_to_dict(t) for t in resp.added)
        modified.extend(_txn_to_dict(t) for t in resp.modified)
        removed.extend(t.transaction_id for t in resp.removed)
        cur = resp.next_cursor
        if not resp.has_more:
            break

    return {"added": added, "modified": modified, "removed": removed, "next_cursor": cur}


def sandbox_create_public_token() -> str:
    """TEST ONLY: mint a public_token for the Sandbox test bank, so the exchange→sync flow
    can be exercised without the frontend Link UI. Guarded to the sandbox environment."""
    s = get_settings()
    if s.plaid_env != "sandbox":
        raise RuntimeError("sandbox_create_public_token is sandbox-only")
    from plaid.model.products import Products
    from plaid.model.sandbox_public_token_create_request import (
        SandboxPublicTokenCreateRequest,
    )

    resp = _client().sandbox_public_token_create(
        SandboxPublicTokenCreateRequest(
            institution_id="ins_109508",  # Plaid's standard Sandbox test institution
            initial_products=[Products("transactions")],
        )
    )
    return resp.public_token


def verify_webhook(body: bytes, verification_header: str) -> bool:
    """Verify Plaid's ``Plaid-Verification`` JWS over the raw request body.

    The public webhook endpoint feeds the ingest path, so nothing is processed until this
    passes (plan §7, CLAUDE.md #11). Checks: ES256 signature against Plaid's per-``kid``
    verification key, token freshness (≤5 min), and that ``request_body_sha256`` matches
    the raw body (tamper-evidence). Any failure → False (reject).
    """
    import hashlib
    import hmac
    import json as _json
    import time

    import jwt
    from jwt.algorithms import ECAlgorithm

    try:
        header = jwt.get_unverified_header(verification_header)
    except Exception:  # noqa: BLE001 - a malformed header is simply not verified
        return False
    if header.get("alg") != "ES256" or "kid" not in header:
        return False

    jwk = _webhook_key(header["kid"])
    if jwk is None:
        return False
    try:
        public_key = ECAlgorithm.from_jwk(_json.dumps(jwk))
        claims = jwt.decode(verification_header, public_key, algorithms=["ES256"])
    except Exception:  # noqa: BLE001 - bad signature / decode failure
        return False

    if time.time() - claims.get("iat", 0) > 5 * 60:
        return False
    expected = claims.get("request_body_sha256", "")
    actual = hashlib.sha256(body).hexdigest()
    return hmac.compare_digest(expected, actual)


@lru_cache
def _webhook_key(kid: str) -> dict | None:
    from plaid.model.webhook_verification_key_get_request import (
        WebhookVerificationKeyGetRequest,
    )

    try:
        resp = _client().webhook_verification_key_get(WebhookVerificationKeyGetRequest(key_id=kid))
        return resp.key.to_dict()
    except Exception:  # noqa: BLE001 - unknown/unreachable key → verification fails
        return None


def _txn_to_dict(t) -> dict:
    """Normalize a Plaid transaction to the fields ingest needs. Money → integer cents via
    Decimal (never float past this boundary). Plaid's sign convention: positive amount =
    money out of the account (a purchase); negative = a credit/refund."""
    pfc = getattr(t, "personal_finance_category", None)
    amount_cents = int((Decimal(str(t.amount)) * 100).to_integral_value(ROUND_HALF_UP))
    purchased_on: date = getattr(t, "authorized_date", None) or t.date
    return {
        "transaction_id": t.transaction_id,
        "name": getattr(t, "merchant_name", None) or t.name,
        "amount_cents": amount_cents,
        "currency": getattr(t, "iso_currency_code", None) or "USD",
        "purchased_on": purchased_on,
        "pending": bool(getattr(t, "pending", False)),
        "pfc_primary": getattr(pfc, "primary", None) if pfc else None,
    }
