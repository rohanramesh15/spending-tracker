"""Unattended reconciliation review queue (plan §6.3, user-flow §6).

When an unattended source (a Plaid webhook / scheduled sync) ingests a transaction that
semantically matches an existing one, ingest saves it as ``needs_review`` and opens a
``reconciliation_reviews`` row — it is **never auto-merged** (CLAUDE.md #5). These
endpoints drain that queue: list the open reviews, and resolve one with the same four
choices as the attended dialog (merge / skip / replace / keep-both).

Resolution semantics here are row-based (both transactions already exist), and the
incoming side is the bank transaction:
- **merge**    — the bank transaction survives (authoritative total/date/source), and the
                 matched entry's itemization (line items + tax/tip + raw JSON) is copied
                 onto it; the matched row is deleted.
- **replace**  — the bank transaction survives and is confirmed; the matched entry is
                 deleted outright (its itemization is discarded).
- **keep_both** — they're different purchases; the bank transaction is confirmed and both
                 rows remain.
- **skip**     — the bank transaction is a duplicate to discard; it is deleted and the
                 matched entry stands.

Deleting a transaction cascades its ``reconciliation_reviews`` rows, so merge/replace/skip
resolve by removing the row from the open queue; keep-both marks it ``resolved``. Either
way ``GET /api/reviews`` (which filters ``resolved_at IS NULL``) reflects the drain.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.schemas import (
    ReviewOut,
    ReviewResolveRequest,
    ReviewResolveResult,
    ReviewTxn,
)
from app.core.auth import current_user_id, get_db
from app.models.enums import Resolution, ReviewStatus
from app.models.tables import LineItem, ReconciliationReview, Transaction
from app.services.reconcile import match_reason

router = APIRouter(prefix="/api", tags=["reviews"])


@router.get("/reviews", response_model=list[ReviewOut])
def list_reviews(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[ReviewOut]:
    reviews = db.exec(
        select(ReconciliationReview)
        .where(
            ReconciliationReview.user_id == user_id,
            ReconciliationReview.resolved_at.is_(None),
        )
        .order_by(ReconciliationReview.created_at.desc())
    ).all()
    if not reviews:
        return []

    ids = {r.incoming_transaction_id for r in reviews} | {
        r.matched_transaction_id for r in reviews
    }
    txns = {
        t.id: t
        for t in db.exec(
            select(Transaction).where(
                Transaction.user_id == user_id, Transaction.id.in_(ids)
            )
        ).all()
    }
    counts = _item_counts(db, user_id, ids)

    out: list[ReviewOut] = []
    for r in reviews:
        incoming = txns.get(r.incoming_transaction_id)
        matched = txns.get(r.matched_transaction_id)
        if incoming is None or matched is None:
            continue  # a side was deleted out from under the row — skip the stale review
        out.append(
            ReviewOut(
                id=str(r.id),
                created_at=r.created_at,
                match_score=r.match_score,
                reason=match_reason(
                    vendor_a=incoming.vendor,
                    date_a=incoming.purchased_on,
                    total_a_cents=incoming.total_cents,
                    vendor_b=matched.vendor,
                    date_b=matched.purchased_on,
                    total_b_cents=matched.total_cents,
                ),
                incoming=_review_txn(incoming, counts),
                matched=_review_txn(matched, counts),
            )
        )
    return out


@router.post("/reviews/{review_id}/resolve", response_model=ReviewResolveResult)
def resolve_review(
    review_id: str,
    body: ReviewResolveRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ReviewResolveResult:
    review = db.exec(
        select(ReconciliationReview).where(
            ReconciliationReview.id == review_id,
            ReconciliationReview.user_id == user_id,
            ReconciliationReview.resolved_at.is_(None),
        )
    ).first()
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found or already resolved")

    incoming = _get_txn(db, user_id, review.incoming_transaction_id)
    matched = _get_txn(db, user_id, review.matched_transaction_id)
    if incoming is None or matched is None:
        # One side vanished; the review is moot. Clear it and report done.
        db.delete(review)
        raise HTTPException(status.HTTP_409_CONFLICT, "One side of this match no longer exists")

    survivor_id = _apply(db, user_id, review, incoming, matched, body.resolution)
    return ReviewResolveResult(
        status="resolved", resolution=body.resolution, transaction_id=survivor_id
    )


def _apply(
    db: Session,
    user_id: str,
    review: ReconciliationReview,
    incoming: Transaction,
    matched: Transaction,
    resolution: Resolution,
) -> str:
    if resolution == Resolution.keep_both:
        # Both are real; confirm the incoming and record the resolution on the row.
        incoming.review_status = ReviewStatus.confirmed
        review.resolved_at = datetime.now(UTC)
        review.resolution = resolution
        db.add(incoming)
        db.add(review)
        return str(incoming.id)

    if resolution == Resolution.skip:
        # The incoming bank line duplicates the existing entry — discard it.
        db.delete(incoming)  # cascades the review row out of the open queue
        return str(matched.id)

    if resolution == Resolution.replace:
        incoming.review_status = ReviewStatus.confirmed
        db.add(incoming)
        db.delete(matched)  # discard the existing entry; cascades the review row
        return str(incoming.id)

    if resolution == Resolution.merge:
        _overlay_itemization(db, user_id, target=incoming, source_txn=matched)
        incoming.review_status = ReviewStatus.confirmed
        db.add(incoming)
        db.delete(matched)  # itemization already copied onto incoming; cascades the row
        return str(incoming.id)

    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown resolution: {resolution}")


def _overlay_itemization(
    db: Session, user_id: str, *, target: Transaction, source_txn: Transaction
) -> None:
    """Copy ``source_txn``'s line items + tax/tip + raw JSON onto ``target``.

    New line-item rows point at ``target``, so they survive the later delete of
    ``source_txn`` (which only cascades its own children).
    """
    for li in db.exec(
        select(LineItem).where(
            LineItem.transaction_id == target.id, LineItem.user_id == user_id
        )
    ).all():
        db.delete(li)  # a bank transaction has none, but be safe if merging twice
    db.flush()

    src_items = db.exec(
        select(LineItem)
        .where(LineItem.transaction_id == source_txn.id, LineItem.user_id == user_id)
        .order_by(LineItem.position)
    ).all()
    for position, li in enumerate(src_items):
        db.add(
            LineItem(
                user_id=user_id,
                transaction_id=target.id,
                position=position,
                raw_name=li.raw_name,
                normalized_name=li.normalized_name,
                category_id=li.category_id,
                price_cents=li.price_cents,
                quantity=li.quantity,
                unit_size=li.unit_size,
                unit=li.unit,
            )
        )
    db.flush()

    target.subtotal_cents = source_txn.subtotal_cents
    target.tax_cents = source_txn.tax_cents
    target.tip_cents = source_txn.tip_cents
    if source_txn.raw_extraction_json is not None:
        target.raw_extraction_json = source_txn.raw_extraction_json
    db.add(target)


def _get_txn(db: Session, user_id: str, txn_id) -> Transaction | None:
    return db.exec(
        select(Transaction).where(
            Transaction.id == txn_id, Transaction.user_id == user_id
        )
    ).first()


def _item_counts(db: Session, user_id: str, txn_ids) -> dict:
    rows = db.exec(
        select(LineItem.transaction_id, func.count())
        .where(LineItem.user_id == user_id, LineItem.transaction_id.in_(txn_ids))
        .group_by(LineItem.transaction_id)
    ).all()
    return {tid: n for tid, n in rows}


def _review_txn(txn: Transaction, counts: dict) -> ReviewTxn:
    return ReviewTxn(
        id=str(txn.id),
        vendor=txn.vendor,
        purchased_on=txn.purchased_on,
        source=txn.source,
        total_cents=txn.total_cents,
        review_status=txn.review_status,
        item_count=counts.get(txn.id, 0),
    )
