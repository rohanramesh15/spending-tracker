"""Spending aggregation for the pie chart (plan §6.6).

Aggregation rule, per transaction:
- Itemized (has line items): chart its line items by category + its tax and tip as their
  own slices; ignore the total.
- Unitemized: chart its total under "Uncategorized".
- review_status = needs_review transactions are excluded until resolved.

Money is integer cents throughout; the frontend divides by 100 only at render.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.api.schemas import SpendingResponse, SpendingSlice
from app.core.auth import current_user_id, get_db
from app.models.enums import ReviewStatus
from app.models.tables import Category, LineItem, Transaction

router = APIRouter(prefix="/api", tags=["insights"])

UNCATEGORIZED = "Uncategorized"


@router.get("/insights/spending", response_model=SpendingResponse)
def spending(
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> SpendingResponse:
    # Confirmed transactions in range only (needs_review excluded).
    txns = db.exec(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.review_status == ReviewStatus.confirmed,
            Transaction.purchased_on >= start,
            Transaction.purchased_on <= end,
        )
    ).all()

    slices: dict[str, int] = defaultdict(int)
    if not txns:
        return SpendingResponse(start=start, end=end, total_cents=0, slices=[])

    txn_ids = [t.id for t in txns]
    items = db.exec(
        select(LineItem).where(LineItem.user_id == user_id, LineItem.transaction_id.in_(txn_ids))
    ).all()
    names = {
        str(c.id): c.name
        for c in db.exec(select(Category).where(Category.user_id == user_id)).all()
    }

    itemized = {li.transaction_id for li in items}

    for t in txns:
        if t.id in itemized:
            # Itemized: tax/tip as their own slices; line items counted below.
            if t.tax_cents:
                slices["Tax"] += t.tax_cents
            if t.tip_cents:
                slices["Tip"] += t.tip_cents
        else:
            # Unitemized: whole total under Uncategorized.
            slices[UNCATEGORIZED] += t.total_cents

    for li in items:
        name = names.get(str(li.category_id), UNCATEGORIZED) if li.category_id else UNCATEGORIZED
        slices[name] += li.price_cents

    ordered = sorted(slices.items(), key=lambda kv: kv[1], reverse=True)
    return SpendingResponse(
        start=start,
        end=end,
        total_cents=sum(slices.values()),
        slices=[SpendingSlice(category=k, cents=v) for k, v in ordered if v],
    )
