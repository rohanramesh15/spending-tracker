"""Bank sync endpoints (plan §6.7, Phase 3).

The connect + sync flow, all through the Plaid seam (``services.plaid_client``) and the
one ingest door:

- ``POST /api/plaid/link-token`` — mint a Link token for the frontend's Plaid Link.
- ``POST /api/plaid/exchange`` — trade Link's public_token for an access_token, store the
  Item on ``linked_accounts``, and run the initial sync.
- ``POST /api/plaid/sync`` — incremental ``/transactions/sync`` for every linked Item,
  feeding each transaction through ``POST /api/ingest`` (so matches land in the
  needs-review queue, never auto-merged).
- ``GET /api/plaid/accounts`` — the connected-accounts list for Settings.

Sandbox only until the final real-account link (CLAUDE.md). If keys are unset, every
endpoint returns 503 "not configured" rather than failing deep in the SDK.

Sign / scope choices: we ingest **posted money-OUT** — purchases AND *outgoing* transfers
(Zelle/Venmo/etc., which on a checking account are usually real expenses). We skip:
pending transactions (they churn as pending→posted), inflows/credits/refunds (non-positive
amount = money coming in), and the money movements that genuinely aren't spending — payroll
& deposits (INCOME), *incoming* transfers (TRANSFER_IN), and credit-card payments
(LOAN_PAYMENTS, which would double-count the card spending we already track) — via Plaid's
Personal Finance Category (``_NON_SPENDING_PFC``). Plaid's ``removed`` list deletes dropped
transactions. Bank rows carry one categorized line item (Plaid PFC → our taxonomy) until a
receipt is merged onto them.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.api.ingest import ingest as ingest_transaction
from app.api.schemas import (
    AccountSyncResult,
    ExchangeRequest,
    ExchangeResult,
    IngestRequest,
    LineItemIn,
    LinkedAccountOut,
    LinkTokenOut,
    SyncSummary,
    UpdateLinkTokenRequest,
)
from app.core.auth import current_user_id, get_db
from app.core.config import get_settings
from app.core.db import admin_session, rls_session
from app.models.enums import AccountStatus, LinkedAccountSource, TransactionSource
from app.models.tables import LinkedAccount, Transaction
from app.services import plaid_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/plaid", tags=["bank-sync"])

# Plaid PFC primaries that are money movements, not spending — kept out of the ledger so
# payroll/deposits/transfers/card-payments don't pollute the chart. (No-op when the hint is
# absent; real accounts populate it reliably.)
# Money movements that aren't spending. NB: TRANSFER_OUT is intentionally NOT here —
# outgoing transfers (Zelle/Venmo out) are money leaving the account and usually real
# expenses, so we keep them. TRANSFER_IN / INCOME are inflows; LOAN_PAYMENTS are card
# payments (double-count) — those we drop.
_NON_SPENDING_PFC = {"INCOME", "TRANSFER_IN", "LOAN_PAYMENTS"}


def _require_configured() -> None:
    if not plaid_client.is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Bank sync isn't configured (no Plaid keys).",
        )


@router.post("/link-token", response_model=LinkTokenOut)
def create_link_token(user_id: str = Depends(current_user_id)) -> LinkTokenOut:
    _require_configured()
    s = get_settings()
    return LinkTokenOut(
        link_token=plaid_client.create_link_token(
            user_id, webhook=s.plaid_webhook_url, redirect_uri=s.plaid_redirect_uri
        )
    )


@router.post("/link-token/update", response_model=LinkTokenOut)
def create_update_link_token_route(
    body: UpdateLinkTokenRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> LinkTokenOut:
    """Update-mode Link token for an existing connection — reconnect a bank that needs
    reauth, or add newly-available accounts, without consuming a new Plaid Item."""
    _require_configured()
    account = db.exec(
        select(LinkedAccount).where(
            LinkedAccount.id == body.linked_account_id,
            LinkedAccount.user_id == user_id,
        )
    ).first()
    if account is None or not account.access_token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    token = plaid_client.create_update_link_token(
        user_id, account.access_token, redirect_uri=get_settings().plaid_redirect_uri
    )
    return LinkTokenOut(link_token=token)


@router.post("/accounts/{account_id}/reconnected", response_model=SyncSummary)
def account_reconnected(
    account_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> SyncSummary:
    """Called after a successful update-mode Link. The existing access token stays valid
    (no exchange in update mode), so mark the account active again and pull anything new —
    including transactions from any accounts just added to the connection."""
    _require_configured()
    account = db.exec(
        select(LinkedAccount).where(
            LinkedAccount.id == account_id, LinkedAccount.user_id == user_id
        )
    ).first()
    if account is None or not account.access_token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    account.status = AccountStatus.active
    db.add(account)
    db.flush()
    return _single_summary(_sync_account(db, user_id, account))


@router.post("/exchange", response_model=ExchangeResult)
def exchange(
    body: ExchangeRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ExchangeResult:
    _require_configured()
    try:
        exchanged = plaid_client.exchange_public_token(body.public_token)
    except Exception as exc:  # noqa: BLE001 - surface SDK/API failures as a clean 502
        logger.exception("Plaid public_token exchange failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't link that account.") from exc

    institution = plaid_client.get_institution_name(exchanged["access_token"])

    # Upsert the Item (re-linking the same bank updates its token rather than duplicating).
    account = db.exec(
        select(LinkedAccount).where(
            LinkedAccount.user_id == user_id, LinkedAccount.item_id == exchanged["item_id"]
        )
    ).first()
    if account is None:
        account = LinkedAccount(
            user_id=user_id,
            institution=institution,
            source=LinkedAccountSource.plaid,
            item_id=exchanged["item_id"],
            external_account_id=exchanged["item_id"],
            status=AccountStatus.active,
        )
    account.access_token = exchanged["access_token"]
    account.institution = institution
    account.status = AccountStatus.active
    db.add(account)
    db.flush()

    result = _sync_account(db, user_id, account)
    return ExchangeResult(account=_account_out(account), synced=_single_summary(result))


@router.post("/sync", response_model=SyncSummary)
def sync(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> SyncSummary:
    _require_configured()
    # Report EVERY Plaid account — including ones we can't sync (reconnect needed) — so the
    # UI never just says "synced" while silently skipping an account (CLAUDE.md honesty).
    accounts = db.exec(
        select(LinkedAccount)
        .where(
            LinkedAccount.user_id == user_id,
            LinkedAccount.source == LinkedAccountSource.plaid,
        )
        .order_by(LinkedAccount.institution)
    ).all()

    results: list[AccountSyncResult] = []
    for account in accounts:
        if account.is_apple_card:
            continue  # imported via CSV, not synced through Plaid
        if account.status == AccountStatus.active and account.access_token:
            results.append(_sync_account(db, user_id, account))
        else:
            reconnect = account.status in (AccountStatus.needs_reauth, AccountStatus.disconnected)
            results.append(
                AccountSyncResult(
                    account_id=str(account.id),
                    institution=account.institution,
                    status=account.status,
                    needs_attention=reconnect,
                    message="Reconnect needed to resume syncing" if reconnect else None,
                )
            )
    return SyncSummary(
        added=sum(r.added for r in results),
        needs_review=sum(r.needs_review for r in results),
        removed=sum(r.removed for r in results),
        accounts=results,
    )


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(request: Request) -> dict:
    """Plaid's push endpoint (public, unauthenticated). Verifies the Plaid-Verification
    JWS over the raw body BEFORE anything else (plan §7), then triggers a sync for the
    affected Item. Idempotent + cursor-based, so redelivery is harmless."""
    body = await request.body()
    if not plaid_client.verify_webhook(body, request.headers.get("Plaid-Verification", "")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature")

    payload = json.loads(body or b"{}")
    webhook_type = payload.get("webhook_type")
    item_id = payload.get("item_id")
    if webhook_type == "TRANSACTIONS" and item_id:
        _sync_item_by_id(item_id)
    elif webhook_type == "ITEM" and item_id:
        _handle_item_webhook(item_id, payload)
    return {"status": "ok"}


def _sync_item_by_id(item_id: str) -> None:
    """Resolve which user owns this Item (a system lookup — no user context on a webhook),
    then run the sync under that user's RLS session. The admin lookup only routes item→
    owner; every user-data write still happens under RLS (CLAUDE.md #3)."""
    with admin_session() as sys_db:
        owner = sys_db.exec(
            select(LinkedAccount.user_id).where(LinkedAccount.item_id == item_id)
        ).first()
    if owner is None:
        return

    claims = {"sub": str(owner), "role": "authenticated"}
    with rls_session(claims) as db:
        account = db.exec(
            select(LinkedAccount).where(
                LinkedAccount.item_id == item_id, LinkedAccount.user_id == owner
            )
        ).first()
        if account is not None and account.access_token:
            _sync_account(db, str(owner), account)


def _handle_item_webhook(item_id: str, payload: dict) -> None:
    """ITEM webhooks that mean the connection needs the user's attention. Flip the account
    to needs_reauth (login/consent lapsed) or disconnected (access revoked) so the UI shows
    'Action needed' and we stop chasing a dead Item until it's reconnected."""
    code = payload.get("webhook_code")
    error_code = (payload.get("error") or {}).get("error_code")
    if (code == "ERROR" and error_code == "ITEM_LOGIN_REQUIRED") or code == "PENDING_EXPIRATION":
        new_status = AccountStatus.needs_reauth
    elif code == "USER_PERMISSION_REVOKED":
        new_status = AccountStatus.disconnected
    else:
        return  # other ITEM webhooks are informational — nothing to change
    _set_item_status(item_id, new_status)


def _set_item_status(item_id: str, new_status: AccountStatus) -> None:
    """System update of one Item's status (a webhook carries no user context); the write
    still runs under the owner's RLS session (CLAUDE.md #3)."""
    with admin_session() as sys_db:
        owner = sys_db.exec(
            select(LinkedAccount.user_id).where(LinkedAccount.item_id == item_id)
        ).first()
    if owner is None:
        return
    claims = {"sub": str(owner), "role": "authenticated"}
    with rls_session(claims) as db:
        account = db.exec(
            select(LinkedAccount).where(
                LinkedAccount.item_id == item_id, LinkedAccount.user_id == owner
            )
        ).first()
        if account is not None:
            account.status = new_status
            db.add(account)


def sync_all_active_items() -> int:
    """Scheduled fallback: re-sync EVERY active Plaid Item across all users, so a missed or
    delayed transaction webhook never leaves data stale — the industry-standard safety net
    behind the webhook fast path. A system job: the admin lookup only enumerates item→owner;
    each sync runs under that owner's RLS session (CLAUDE.md #3). Cursor-based + idempotent,
    so overlapping a webhook sync is harmless. Returns the number of items synced."""
    if not plaid_client.is_configured():
        return 0
    with admin_session() as sys_db:
        item_ids = sys_db.exec(
            select(LinkedAccount.item_id).where(
                LinkedAccount.source == LinkedAccountSource.plaid,
                LinkedAccount.status == AccountStatus.active,
                LinkedAccount.item_id.is_not(None),
            )
        ).all()
    synced = 0
    for item_id in item_ids:
        try:
            _sync_item_by_id(item_id)
            synced += 1
        except Exception:  # noqa: BLE001 - one bad Item must not halt the batch
            logger.exception("scheduled Plaid sync failed for item %s", item_id)
    return synced


@router.get("/accounts", response_model=list[LinkedAccountOut])
def list_accounts(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[LinkedAccountOut]:
    accounts = db.exec(
        select(LinkedAccount)
        .where(LinkedAccount.user_id == user_id)
        .order_by(LinkedAccount.created_at.desc())
    ).all()
    return [_account_out(a) for a in accounts]


def _single_summary(r: AccountSyncResult) -> SyncSummary:
    """Wrap a one-account result as a top-level SyncSummary (exchange/reconnect responses)."""
    return SyncSummary(added=r.added, needs_review=r.needs_review, removed=r.removed, accounts=[r])


def _sync_account(db: Session, user_id: str, account: LinkedAccount) -> AccountSyncResult:
    """Pull this Item's changes and feed them through the ingest door."""
    result = plaid_client.sync_transactions(account.access_token, account.transactions_cursor)

    added = needs_review = skipped = 0
    for txn in [*result["added"], *result["modified"]]:
        if (
            txn["pending"]
            or txn["amount_cents"] <= 0  # inflow (money in) — not spending
            or txn["pfc_primary"] in _NON_SPENDING_PFC  # income / transfer-in / card payment
        ):
            skipped += 1
            continue  # posted money-OUT only (see module docstring)
        payload = IngestRequest(
            source=TransactionSource.plaid,
            external_id=txn["transaction_id"],
            linked_account_id=str(account.id),
            vendor=txn["name"],
            purchased_on=txn["purchased_on"],
            total_cents=txn["amount_cents"],
            currency=txn["currency"],
            # One line item carrying the whole charge + Plaid's category hint, so bank
            # spending is categorized (via categorize()) instead of "Uncategorized". A
            # later receipt merge replaces this with the receipt's real itemization.
            line_items=[
                LineItemIn(
                    raw_name=txn["name"],
                    price_cents=txn["amount_cents"],
                    plaid_pfc=txn["pfc_primary"],
                )
            ],
        )
        outcome = ingest_transaction(payload, db=db, user_id=user_id)
        if outcome.status == "created":
            added += 1
        elif outcome.status == "needs_review":
            needs_review += 1

    removed = _remove_transactions(db, user_id, result["removed"])

    account.transactions_cursor = result["next_cursor"]
    account.last_synced_at = datetime.now(UTC)
    db.add(account)
    return AccountSyncResult(
        account_id=str(account.id),
        institution=account.institution,
        status=account.status,
        added=added,
        needs_review=needs_review,
        removed=removed,
        skipped=skipped,
    )


def _remove_transactions(db: Session, user_id: str, transaction_ids: list[str]) -> int:
    if not transaction_ids:
        return 0
    rows = db.exec(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.source == TransactionSource.plaid,
            Transaction.external_id.in_(transaction_ids),
        )
    ).all()
    for row in rows:
        db.delete(row)  # line items (rare for bank txns) cascade
    return len(rows)


def _account_out(account: LinkedAccount) -> LinkedAccountOut:
    return LinkedAccountOut(
        id=str(account.id),
        institution=account.institution,
        status=account.status,
        is_apple_card=account.is_apple_card,
        last_synced_at=account.last_synced_at,
    )
