"""Recurring-items view (plan §6.8, user-flow §8b).

``GET /api/recurring`` computes repeatedly-bought items on the fly from confirmed line
items in a trailing window (default 90 days), keyed on canonical name. Returns the list
for the Insights "Recurring" section: name, times bought, average unit price, and a
price-over-time series for the sparkline. The "find it cheaper" leg is Phase 5 (deferred).
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.api.schemas import PricePoint, RecurringItemOut
from app.core.auth import current_user_id, get_db
from app.models.enums import ReviewStatus
from app.models.tables import Category, LineItem, Transaction
from app.services.recurring import LineRow, canonical_key, detect_recurring

router = APIRouter(prefix="/api", tags=["recurring"])


@router.get("/recurring", response_model=list[RecurringItemOut])
def list_recurring(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
    window_days: int = Query(default=90, ge=1, le=730),
    min_occurrences: int = Query(default=3, ge=2, le=50),
) -> list[RecurringItemOut]:
    since = date.today() - timedelta(days=window_days)

    # Confirmed transactions only (needs_review is excluded everywhere until resolved),
    # in the window; RLS is the net, we still filter user_id (CLAUDE.md #3).
    txn_dates = {
        t.id: t.purchased_on
        for t in db.exec(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.review_status == ReviewStatus.confirmed,
                Transaction.purchased_on >= since,
            )
        ).all()
    }
    if not txn_dates:
        return []

    items = db.exec(
        select(LineItem).where(
            LineItem.user_id == user_id,
            LineItem.transaction_id.in_(list(txn_dates.keys())),
        )
    ).all()

    rows = [
        LineRow(
            canonical=canonical_key(li.raw_name, li.normalized_name),
            category_id=str(li.category_id) if li.category_id else None,
            purchased_on=txn_dates[li.transaction_id],
            transaction_id=str(li.transaction_id),
            price_cents=li.price_cents,
            quantity=li.quantity,
        )
        for li in items
    ]

    aggregates = detect_recurring(rows, min_occurrences=min_occurrences)
    if not aggregates:
        return []

    names = {
        str(c.id): c.name
        for c in db.exec(select(Category).where(Category.user_id == user_id)).all()
    }
    return [
        RecurringItemOut(
            canonical_name=a.canonical_name,
            category_name=names.get(a.category_id) if a.category_id else None,
            occurrences=a.occurrences,
            avg_unit_price_cents=a.avg_unit_price_cents,
            first_seen=a.first_seen,
            last_seen=a.last_seen,
            price_history=[
                PricePoint(purchased_on=d, unit_price_cents=p) for d, p in a.price_history
            ],
        )
        for a in aggregates
    ]
