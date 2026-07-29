"""Transaction read/delete endpoints backing the ledger and detail views."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.schemas import (
    HideLineItemRequest,
    HideTransactionRequest,
    LineItemOut,
    LineItemUpdate,
    TransactionDetail,
    TransactionListItem,
    TransactionUpdate,
)
from app.core.auth import current_user_id, get_db
from app.models.tables import Category, LineItem, Transaction

router = APIRouter(prefix="/api", tags=["transactions"])


def _category_names(db: Session, user_id: str) -> dict[str, str]:
    rows = db.exec(select(Category).where(Category.user_id == user_id)).all()
    return {str(c.id): c.name for c in rows}


def _get_owned_transaction(db: Session, user_id: str, transaction_id: str) -> Transaction:
    txn = db.exec(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user_id)
    ).first()
    if txn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    return txn


def _to_detail(db: Session, txn: Transaction, user_id: str) -> TransactionDetail:
    """Shared serialization so every mutating endpoint returns the SAME shape as the plain
    GET — used after create-adjacent edits so the frontend can trust the response, and to
    keep this the one place the wire format is assembled."""
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
        hidden=txn.hidden,
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
                hidden=li.hidden,
            )
            for li in items
        ],
    )


def _get_owned_item(db: Session, user_id: str, txn: Transaction, item_id: str) -> LineItem:
    item = db.exec(
        select(LineItem).where(
            LineItem.id == item_id,
            LineItem.transaction_id == txn.id,
            LineItem.user_id == user_id,
        )
    ).first()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return item


def _recompute_from_line_items(db: Session, txn: Transaction) -> None:
    """Re-sum the transaction's NON-HIDDEN line items into subtotal_cents + total_cents.
    DELETE-then-reinsert-equivalent (a fresh SUM, never an increment/decrement), so an edit,
    delete, or hide/unhide can never leave the stored total drifted from what actually
    counts. A hidden item stays in the item list (see _to_detail) but contributes nothing
    here — that's the whole point of hiding vs. deleting it."""
    total = db.exec(
        select(func.coalesce(func.sum(LineItem.price_cents), 0)).where(
            LineItem.transaction_id == txn.id,
            LineItem.user_id == txn.user_id,
            LineItem.hidden == False,  # noqa: E712 - SQLAlchemy needs `== False`, not `is False`
        )
    ).one()
    txn.subtotal_cents = total
    txn.total_cents = total + txn.tax_cents + txn.tip_cents
    db.add(txn)


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

    # Grouped queries over the page's transactions (avoid N+1): item counts, and the
    # distinct line-item category names (for the chips on each row, in item order).
    counts: dict[str, int] = {}
    cats: dict[str, list[str]] = {}
    if txns:
        ids = [t.id for t in txns]
        count_rows = db.exec(
            select(LineItem.transaction_id, func.count())
            .where(LineItem.user_id == user_id, LineItem.transaction_id.in_(ids))
            .group_by(LineItem.transaction_id)
        ).all()
        counts = {str(tid): n for tid, n in count_rows}

        cat_rows = db.exec(
            select(LineItem.transaction_id, Category.name)
            .join(Category, Category.id == LineItem.category_id)
            .where(LineItem.user_id == user_id, LineItem.transaction_id.in_(ids))
            .order_by(LineItem.transaction_id, LineItem.position)
        ).all()
        for tid, name in cat_rows:
            names = cats.setdefault(str(tid), [])
            if name not in names:  # distinct, preserving first-seen (item) order
                names.append(name)

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
            categories=cats.get(str(t.id), []),
            hidden=t.hidden,
        )
        for t in txns
    ]


@router.get("/transactions/{transaction_id}", response_model=TransactionDetail)
def get_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionDetail:
    txn = _get_owned_transaction(db, user_id, transaction_id)
    return _to_detail(db, txn, user_id)


@router.patch("/transactions/{transaction_id}", response_model=TransactionDetail)
def update_transaction(
    transaction_id: str,
    body: TransactionUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionDetail:
    """Edit vendor/date/tax/tip. Tax/tip are only folded into total_cents when the
    transaction is itemized (subtotal_cents is tracked) — an unitemized transaction's total
    came from the bank/manual entry as a single number with no principal to add tax/tip onto,
    so it's left untouched (the frontend only shows those fields when itemized)."""
    vendor = body.vendor.strip()
    if not vendor:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vendor can't be blank")

    txn = _get_owned_transaction(db, user_id, transaction_id)
    txn.vendor = vendor
    txn.purchased_on = body.purchased_on
    if txn.subtotal_cents is not None:
        txn.tax_cents = body.tax_cents
        txn.tip_cents = body.tip_cents
        txn.total_cents = txn.subtotal_cents + txn.tax_cents + txn.tip_cents
    db.add(txn)
    db.flush()
    return _to_detail(db, txn, user_id)


@router.patch("/transactions/{transaction_id}/items/{item_id}", response_model=TransactionDetail)
def update_line_item(
    transaction_id: str,
    item_id: str,
    body: LineItemUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionDetail:
    name = body.normalized_name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name can't be blank")

    txn = _get_owned_transaction(db, user_id, transaction_id)
    item = _get_owned_item(db, user_id, txn, item_id)

    if body.category_id is not None:
        owns_category = db.exec(
            select(Category).where(Category.id == body.category_id, Category.user_id == user_id)
        ).first()
        if owns_category is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category")

    item.normalized_name = name
    item.category_id = body.category_id
    item.price_cents = body.price_cents
    db.add(item)
    db.flush()

    _recompute_from_line_items(db, txn)
    db.flush()
    return _to_detail(db, txn, user_id)


@router.delete("/transactions/{transaction_id}/items/{item_id}", response_model=TransactionDetail)
def delete_line_item(
    transaction_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionDetail:
    """Removes exactly one item and re-sums the total. If it was the last item, the
    transaction is left with subtotal_cents=0 (tax/tip only) rather than being deleted — use
    the transaction-level delete for that."""
    txn = _get_owned_transaction(db, user_id, transaction_id)
    item = _get_owned_item(db, user_id, txn, item_id)

    db.delete(item)
    db.flush()

    _recompute_from_line_items(db, txn)
    db.flush()
    return _to_detail(db, txn, user_id)


@router.post(
    "/transactions/{transaction_id}/items/{item_id}/hide", response_model=TransactionDetail
)
def set_line_item_hidden(
    transaction_id: str,
    item_id: str,
    body: HideLineItemRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionDetail:
    """Hide/unhide one item: it stays in the item list, but a hidden item contributes
    nothing to subtotal_cents/total_cents (via _recompute_from_line_items) or to the pie
    chart's category slices (insights.spending() applies the same filter)."""
    txn = _get_owned_transaction(db, user_id, transaction_id)
    item = _get_owned_item(db, user_id, txn, item_id)

    item.hidden = body.hidden
    db.add(item)
    db.flush()

    _recompute_from_line_items(db, txn)
    db.flush()
    return _to_detail(db, txn, user_id)


@router.post("/transactions/{transaction_id}/hide", response_model=TransactionDetail)
def set_transaction_hidden(
    transaction_id: str,
    body: HideTransactionRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionDetail:
    """Hide/unhide a whole purchase: it stays in the ledger (and keeps its stored totals)
    but contributes nothing to insights.spending(). Unlike item-level hide, this does not
    recompute money columns — it's a charting flag only."""
    txn = _get_owned_transaction(db, user_id, transaction_id)
    txn.hidden = body.hidden
    db.add(txn)
    db.flush()
    return _to_detail(db, txn, user_id)


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> None:
    txn = _get_owned_transaction(db, user_id, transaction_id)
    db.delete(txn)  # line_items cascade via composite FK
