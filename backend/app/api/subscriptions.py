"""Subscriptions API (docs/subscriptions-plan.md §2–§4).

v3: **persistence + user control.** ``GET`` reads the stored ``subscriptions`` table (hidden
statuses excluded by default). A **recompute** (explicit ``POST /recompute``, and the v4
daily scan) runs detect+enrich and **upserts by (user_id, merchant)**: new rows land as
``detected``; detection fields are refreshed on existing rows; a user-set ``status``
(confirmed/dismissed/cancelled) is NEVER overwritten, so dismissed subs don't resurface. This
keeps the LLM off the read path (plan §3 caveat) — it runs only on recompute.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.schemas import (
    SubscriptionOut,
    SubscriptionStatusUpdate,
    SubscriptionSummary,
    SubscriptionTrendPoint,
    SubscriptionTypeBreakdown,
)
from app.core.auth import current_user_id, get_db
from app.core.db import admin_session, rls_session
from app.models.enums import AccountStatus, NotificationKind, ReviewStatus, SubscriptionStatus
from app.models.tables import LinkedAccount, Notification, Subscription, Transaction
from app.services.subscription_enrich import enrich_subscriptions
from app.services.subscription_monitor import (
    SubscriptionDelta,
    SubSnapshot,
    compute_deltas,
    notification_for,
)
from app.services.subscriptions import (
    SURFACE_CONFIDENCE,
    TxnInput,
    detect_subscriptions,
    monthly_cost_cents,
    normalize_merchant,
    summarize_by_type,
)

_ACTIVE_STATUSES = (SubscriptionStatus.detected, SubscriptionStatus.confirmed)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["subscriptions"])

# Only candidates at/above this confidence are persisted; below it is noise (plan §1.4).
_PERSIST_MIN_CONFIDENCE = SURFACE_CONFIDENCE

# Statuses hidden from the default view (the user has said "not a sub" or "gone").
_HIDDEN_STATUSES = (SubscriptionStatus.dismissed, SubscriptionStatus.cancelled)


def _row_out(r: Subscription) -> SubscriptionOut:
    return SubscriptionOut(
        id=str(r.id),
        merchant=r.merchant,
        display_name=r.display_name,
        type=r.type,
        amount_cents=r.amount_cents,
        cadence=r.cadence,
        monthly_cost_cents=monthly_cost_cents(r.amount_cents, r.cadence),
        occurrences=r.occurrences,
        first_charged_on=r.first_charged_on,
        last_charged_on=r.last_charged_on,
        next_charge_on=r.next_charge_on,
        confidence=float(r.confidence) if r.confidence is not None else 0.0,
        status=r.status,
    )


def _load_txn_inputs(db: Session, user_id: str) -> list[TxnInput]:
    rows = db.exec(
        select(
            Transaction.vendor,
            Transaction.purchased_on,
            Transaction.total_cents,
        ).where(
            Transaction.user_id == user_id,
            Transaction.review_status != ReviewStatus.needs_review,
        )
    ).all()
    return [
        TxnInput(vendor=vendor, purchased_on=purchased_on, amount_cents=total_cents)
        for vendor, purchased_on, total_cents in rows
    ]


def recompute_subscriptions(db: Session, user_id: str) -> None:
    """Detect + enrich from the user's transactions and upsert into ``subscriptions``.

    Shared by the endpoint and the v4 scan. Never overwrites a user-set ``status``; leaves
    rows no longer detected in place (a confirmed sub that paused shouldn't vanish — v4's
    ``likely_cancelled`` handles genuine disappearance).
    """
    candidates = [
        s
        for s in detect_subscriptions(_load_txn_inputs(db, user_id))
        if s.confidence >= _PERSIST_MIN_CONFIDENCE
    ]
    detected = enrich_subscriptions(candidates)

    existing = {
        row.merchant: row
        for row in db.exec(select(Subscription).where(Subscription.user_id == user_id)).all()
    }
    now = datetime.now(UTC)
    for d in detected:
        row = existing.get(d.merchant)
        if row is None:
            db.add(
                Subscription(
                    user_id=user_id,
                    merchant=d.merchant,
                    display_name=d.display_name,
                    type=d.type,
                    amount_cents=d.amount_cents,
                    cadence=d.cadence,
                    status=SubscriptionStatus.detected,
                    occurrences=d.occurrences,
                    first_charged_on=d.first_charged_on,
                    last_charged_on=d.last_charged_on,
                    next_charge_on=d.next_charge_on,
                    confidence=Decimal(str(d.confidence)),
                )
            )
        else:
            # Refresh detection fields; STATUS is user/scan-owned — never touched here.
            row.display_name = d.display_name
            if d.type is not None:
                row.type = d.type
            row.amount_cents = d.amount_cents
            row.cadence = d.cadence
            row.occurrences = d.occurrences
            row.first_charged_on = d.first_charged_on
            row.last_charged_on = d.last_charged_on
            row.next_charge_on = d.next_charge_on
            row.confidence = Decimal(str(d.confidence))
            row.updated_at = now
            db.add(row)
    db.flush()


def _list(db: Session, user_id: str, include_hidden: bool) -> list[SubscriptionOut]:
    stmt = select(Subscription).where(Subscription.user_id == user_id)
    if not include_hidden:
        stmt = stmt.where(Subscription.status.not_in(_HIDDEN_STATUSES))
    rows = list(db.exec(stmt).all())
    rows.sort(key=lambda r: monthly_cost_cents(r.amount_cents, r.cadence), reverse=True)
    return [_row_out(r) for r in rows]


@router.get("/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
    include_hidden: bool = Query(False),
) -> list[SubscriptionOut]:
    # Explicit user_id filter; RLS is the net, not the filter (CLAUDE.md #3).
    return _list(db, user_id, include_hidden)


@router.post("/subscriptions/recompute", response_model=list[SubscriptionOut])
def recompute(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
    include_hidden: bool = Query(False),
) -> list[SubscriptionOut]:
    recompute_subscriptions(db, user_id)
    return _list(db, user_id, include_hidden)


@router.post("/subscriptions/{subscription_id}/status", response_model=SubscriptionOut)
def set_status(
    subscription_id: str,
    body: SubscriptionStatusUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> SubscriptionOut:
    row = db.exec(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.user_id == user_id,
        )
    ).first()
    if row is None:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Subscription not found")
    row.status = body.status
    row.updated_at = datetime.now(UTC)
    db.add(row)
    db.flush()
    return _row_out(row)


# --- v5: insights summary (docs/subscriptions-plan.md §6) ---------------------------


@router.get("/subscriptions/summary", response_model=SubscriptionSummary)
def summary(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
    months: int = Query(6, ge=1, le=24),
) -> SubscriptionSummary:
    active = list(
        db.exec(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status.in_(_ACTIVE_STATUSES),
            )
        ).all()
    )
    total_monthly = sum(monthly_cost_cents(r.amount_cents, r.cadence) for r in active)
    by_type = [
        SubscriptionTypeBreakdown(**b)
        for b in summarize_by_type(
            [(r.type, monthly_cost_cents(r.amount_cents, r.cadence)) for r in active]
        )
    ]
    active_merchants = {r.merchant for r in active}
    return SubscriptionSummary(
        total_monthly_cents=total_monthly,
        annualized_cents=total_monthly * 12,
        active_count=len(active),
        by_type=by_type,
        trend=_recurring_trend(db, user_id, active_merchants, months),
    )


def _last_months(today: date, n: int) -> list[str]:
    """The last ``n`` calendar months as ``YYYY-MM`` strings, oldest first, ending this month."""
    labels: list[str] = []
    y, m = today.year, today.month
    for _ in range(n):
        labels.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(labels))


def _recurring_trend(
    db: Session, user_id: str, active_merchants: set[str], months: int, today: date | None = None
) -> list[SubscriptionTrendPoint]:
    """Monthly actual recurring spend: transactions whose vendor maps to an active subscription
    merchant, bucketed by month (grounds the trend in real charges, not projections)."""
    today = today or datetime.now(UTC).date()
    labels = _last_months(today, months)
    buckets = dict.fromkeys(labels, 0)
    if active_merchants:
        start = date(int(labels[0][:4]), int(labels[0][5:7]), 1)
        rows = db.exec(
            select(Transaction.vendor, Transaction.purchased_on, Transaction.total_cents).where(
                Transaction.user_id == user_id,
                Transaction.review_status != ReviewStatus.needs_review,
                Transaction.purchased_on >= start,
            )
        ).all()
        for vendor, purchased_on, total_cents in rows:
            if normalize_merchant(vendor) in active_merchants:
                label = f"{purchased_on.year:04d}-{purchased_on.month:02d}"
                if label in buckets:
                    buckets[label] += total_cents
    return [SubscriptionTrendPoint(month=label, cents=buckets[label]) for label in labels]


# --- v4: daily scan (docs/subscriptions-plan.md §5) ---------------------------------


def _snapshot(r: Subscription) -> SubSnapshot:
    return SubSnapshot(
        id=str(r.id),
        merchant=r.merchant,
        display_name=r.display_name,
        amount_cents=r.amount_cents,
        cadence=r.cadence,
        status=str(r.status),
        last_charged_on=r.last_charged_on,
        next_charge_on=r.next_charge_on,
    )


def scan_all_subscriptions(today: date | None = None) -> dict:
    """Daily scan (worker job): recompute every user, emit alert notifications, auto-cancel
    overdue subs. Enumerates ALL users via distinct transaction owners (not just Plaid-linked
    ones), each processed under their own RLS session (CLAUDE.md #3)."""
    today = today or datetime.now(UTC).date()
    with admin_session() as sys_db:
        user_ids = list(sys_db.exec(select(Transaction.user_id).distinct()).all())

    notifications = 0
    for uid in user_ids:
        claims = {"sub": str(uid), "role": "authenticated"}
        try:
            with rls_session(claims) as db:
                notifications += _scan_user(db, str(uid), today)
        except Exception:  # noqa: BLE001 - one bad user must not halt the batch
            logger.exception("subscriptions scan failed for user %s", uid)
    return {"job": "subscriptions_scan", "users": len(user_ids), "notifications": notifications}


def _scan_user(db: Session, user_id: str, today: date) -> int:
    before = {
        r.merchant: _snapshot(r)
        for r in db.exec(select(Subscription).where(Subscription.user_id == user_id)).all()
    }
    recompute_subscriptions(db, user_id)
    after_rows = list(db.exec(select(Subscription).where(Subscription.user_id == user_id)).all())

    latest_sync_dt = db.exec(
        select(func.max(LinkedAccount.last_synced_at)).where(
            LinkedAccount.user_id == user_id,
            LinkedAccount.status == AccountStatus.active,
        )
    ).one()
    latest_sync = latest_sync_dt.date() if latest_sync_dt else None

    deltas = compute_deltas(
        before=before,
        after=[_snapshot(r) for r in after_rows],
        today=today,
        latest_sync=latest_sync,
    )

    rows_by_id = {str(r.id): r for r in after_rows}
    now = datetime.now(UTC)
    emitted = 0
    for d in deltas:
        if d.kind == "likely_cancelled":
            row = rows_by_id.get(d.subscription_id)
            if row is not None and row.status in (
                SubscriptionStatus.detected,
                SubscriptionStatus.confirmed,
            ):
                row.status = SubscriptionStatus.cancelled
                row.updated_at = now
                db.add(row)
        if _emit_notification(db, user_id, d):
            emitted += 1
    db.flush()
    return emitted


def _emit_notification(db: Session, user_id: str, d: SubscriptionDelta) -> bool:
    """Insert a notification unless its dedup key already exists (scan idempotency)."""
    dedup_key, title, body = notification_for(d)
    exists = db.exec(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.dedup_key == dedup_key,
        )
    ).first()
    if exists is not None:
        return False
    db.add(
        Notification(
            user_id=user_id,
            kind=NotificationKind(d.kind),
            subscription_id=uuid.UUID(d.subscription_id),
            title=title,
            body=body,
            dedup_key=dedup_key,
        )
    )
    return True
