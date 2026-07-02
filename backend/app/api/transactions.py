"""Transaction read/delete endpoints backing the ledger and detail views."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.schemas import LineItemOut, TransactionDetail, TransactionListItem
from app.core.auth import current_user_id, get_db
from app.models.tables import Category, LineItem, Transaction

router = APIRouter(prefix="/api", tags=["transactions"])


def _category_names(db: Session, user_id: str) -> dict[str, str]:
    rows = db.exec(select(Category).where(Category.user_id == user_id)).all()
    return {str(c.id): c.name for c in rows}


@router.get("/transactions", response_model=list[TransactionListItem])
def list_transactions(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    limit: int = Query(default=200, le=500),
) -> list[TransactionListItem]:
    stmt = select(Transaction).where(Transaction.user_id == user_id)
    if start is not None:
        stmt = stmt.where(Transaction.purchased_on >= start)
    if end is not None:
        stmt = stmt.where(Transaction.purchased_on <= end)
    stmt = stmt.order_by(Transaction.purchased_on.desc(), Transaction.created_at.desc()).limit(
        limit
    )
    txns = db.exec(stmt).all()

    # One grouped query for item counts (avoid N+1).
    counts: dict[str, int] = {}
    if txns:
        ids = [t.id for t in txns]
        count_rows = db.exec(
            select(LineItem.transaction_id, func.count())
            .where(LineItem.user_id == user_id, LineItem.transaction_id.in_(ids))
            .group_by(LineItem.transaction_id)
        ).all()
        counts = {str(tid): n for tid, n in count_rows}

    return [
        TransactionListItem(
            id=str(t.id),
            vendor=t.vendor,
            purchased_on=t.purchased_on,
            source=t.source,
            total_cents=t.total_cents,
            currency=t.currency,
            review_status=t.review_status,
            item_count=counts.get(str(t.id), 0),
        )
        for t in txns
    ]


@router.get("/transactions/{transaction_id}", response_model=TransactionDetail)
def get_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionDetail:
    txn = db.exec(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user_id)
    ).first()
    if txn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")

    names = _category_names(db, user_id)
    items = db.exec(
        select(LineItem)
        .where(LineItem.transaction_id == txn.id, LineItem.user_id == user_id)
        .order_by(LineItem.position)
    ).all()

    return TransactionDetail(
        id=str(txn.id),
        vendor=txn.vendor,
        purchased_on=txn.purchased_on,
        purchased_time=txn.purchased_time,
        source=txn.source,
        subtotal_cents=txn.subtotal_cents,
        tax_cents=txn.tax_cents,
        tip_cents=txn.tip_cents,
        total_cents=txn.total_cents,
        currency=txn.currency,
        review_status=txn.review_status,
        item_count=len(items),
        line_items=[
            LineItemOut(
                id=str(li.id),
                position=li.position,
                raw_name=li.raw_name,
                normalized_name=li.normalized_name,
                category_id=str(li.category_id) if li.category_id else None,
                category_name=names.get(str(li.category_id)) if li.category_id else None,
                price_cents=li.price_cents,
                quantity=li.quantity,
                unit_size=li.unit_size,
                unit=li.unit,
            )
            for li in items
        ],
    )


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> None:
    txn = db.exec(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user_id)
    ).first()
    if txn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    db.delete(txn)  # line_items cascade via composite FK
