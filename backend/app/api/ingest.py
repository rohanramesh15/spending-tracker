"""The single source-agnostic ingest door: ``POST /api/ingest`` (plan §6.3).

Manual, receipt, Plaid, and the future Apple Card agent all post here. Two paths:

- **Fresh ingest** (no ``resolution``): for attended sources (receipt/manual) we first
  look for a semantic duplicate (``services.reconcile.find_match``). If one is found we
  write *nothing* and return ``needs_decision`` + the match, so the client shows the
  merge/skip/replace/keep-both dialog immediately (CLAUDE.md #5 — never auto-merge). No
  match → insert normally.
- **Resolution** (``resolution`` set): the user has chosen. We apply merge / skip /
  replace / keep-both against ``matched_transaction_id`` and return the surviving row.

Idempotency on ``(source, external_id)`` is enforced by the DB unique constraint;
receipt/manual carry a NULL ``external_id`` (Postgres treats NULLs as distinct, so
re-scanning is deduped by reconciliation, not the constraint). The *unattended*
needs-review queue for Plaid webhooks lands in Phase 3.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.schemas import IngestRequest, IngestResult, ReconcileMatch, TransactionOut
from app.core.auth import current_user_id, get_db
from app.models.enums import Resolution, ReviewStatus, TransactionSource
from app.models.tables import Category, LineItem, ReconciliationReview, Transaction
from app.services.categorize import categorize
from app.services.extract import classify_category
from app.services.reconcile import find_match, match_score

router = APIRouter(prefix="/api", tags=["ingest"])

# Sources where a human is present at save time, so a match is resolved via the immediate
# dialog rather than parked in the needs-review queue (plan §6.3).
_ATTENDED_SOURCES = {TransactionSource.receipt, TransactionSource.manual}


@router.post("/ingest", response_model=IngestResult)
def ingest(
    payload: IngestRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> IngestResult:
    # Second pass: the user already picked a resolution in the attended dialog.
    if payload.resolution is not None:
        return _apply_resolution(db, user_id, payload)

    # Idempotency: a source carrying an external_id (Plaid, future Apple Card) may
    # redeliver the same transaction (webhook retries, re-sync). Return the existing row
    # rather than duplicating. The (user, source, external_id) unique index is the hard
    # backstop; this makes the redelivery a clean 200 instead of a constraint error.
    if payload.external_id is not None:
        existing = db.exec(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.source == payload.source,
                Transaction.external_id == payload.external_id,
            )
        ).first()
        if existing is not None:
            _backfill_card_fields(db, existing, payload)
            return IngestResult(status="exists", transaction=_to_out(existing))

    match = find_match(
        db,
        user_id,
        vendor=payload.vendor,
        purchased_on=payload.purchased_on,
        total_cents=payload.total_cents,
    )
    if match is not None:
        if payload.source in _ATTENDED_SOURCES:
            # You're present → resolve via the immediate dialog; write nothing yet.
            return IngestResult(status="needs_decision", match=_match_out(db, user_id, match))
        # Unattended (Plaid webhook / scheduled sync) → NEVER auto-merge (CLAUDE.md #5).
        # Save the incoming as needs_review and open a reconciliation_reviews row; it's
        # excluded from charts until you resolve it from the queue.
        txn = _insert_transaction(db, user_id, payload, review_status=ReviewStatus.needs_review)
        _open_review(db, user_id, incoming=txn, matched=match)
        return IngestResult(status="needs_review", transaction=_to_out(txn))

    txn = _insert_transaction(db, user_id, payload)
    return IngestResult(status="created", transaction=_to_out(txn))


def _apply_resolution(db: Session, user_id: str, payload: IngestRequest) -> IngestResult:
    """Carry out the user's merge/skip/replace/keep-both choice from the dialog."""
    resolution = payload.resolution

    # Keep-both needs no target: just insert the incoming alongside the existing one.
    if resolution == Resolution.keep_both:
        txn = _insert_transaction(db, user_id, payload)
        return IngestResult(status="created", transaction=_to_out(txn))

    if not payload.matched_transaction_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "matched_transaction_id is required for merge/skip/replace",
        )
    matched = db.exec(
        select(Transaction).where(
            Transaction.id == payload.matched_transaction_id,
            Transaction.user_id == user_id,
        )
    ).first()
    if matched is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Matched transaction not found")

    if resolution == Resolution.skip:
        # Discard the incoming; the existing transaction stands unchanged.
        return IngestResult(status="skipped", transaction=_to_out(matched))

    if resolution == Resolution.replace:
        # The incoming wins outright: drop the old row (line items cascade) and re-insert.
        db.delete(matched)
        db.flush()
        txn = _insert_transaction(db, user_id, payload)
        return IngestResult(status="resolved", transaction=_to_out(txn))

    if resolution == Resolution.merge:
        _merge_into(db, user_id, matched, payload)
        return IngestResult(status="resolved", transaction=_to_out(matched))

    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown resolution: {resolution}")


def _merge_into(db: Session, user_id: str, matched: Transaction, payload: IngestRequest) -> None:
    """Attach the incoming receipt's itemization onto the existing transaction.

    Plan §6.3 merge default: the existing transaction is authoritative for total / date /
    vendor / source (in the card+receipt case the card is the source of truth); the
    incoming receipt supplies the line items + tax/tip + raw extraction. We replace the
    existing line items so the receipt's itemization is the record.
    """
    for li in db.exec(
        select(LineItem).where(
            LineItem.transaction_id == matched.id,
            LineItem.user_id == user_id,
        )
    ).all():
        db.delete(li)
    db.flush()

    matched.subtotal_cents = payload.subtotal_cents
    matched.tax_cents = payload.tax_cents
    matched.tip_cents = payload.tip_cents
    if payload.raw_extraction_json is not None:
        matched.raw_extraction_json = payload.raw_extraction_json
    matched.review_status = ReviewStatus.confirmed
    db.add(matched)

    _add_line_items(db, user_id, matched.id, payload)


def _insert_transaction(
    db: Session,
    user_id: str,
    payload: IngestRequest,
    review_status: ReviewStatus = ReviewStatus.confirmed,
) -> Transaction:
    txn = Transaction(
        user_id=user_id,
        vendor=payload.vendor,
        purchased_on=payload.purchased_on,
        purchased_time=payload.purchased_time,
        source=payload.source,
        external_id=payload.external_id,
        linked_account_id=payload.linked_account_id,
        card_id=payload.card_id,
        pfc_primary=payload.pfc_primary,
        pfc_detailed=payload.pfc_detailed,
        subtotal_cents=payload.subtotal_cents,
        tax_cents=payload.tax_cents,
        tip_cents=payload.tip_cents,
        total_cents=payload.total_cents,
        currency=payload.currency,
        raw_extraction_json=payload.raw_extraction_json,
        review_status=review_status,
    )
    db.add(txn)
    db.flush()  # assign txn.id within the request transaction
    _add_line_items(db, user_id, txn.id, payload)
    return txn


def _backfill_card_fields(db: Session, existing: Transaction, payload: IngestRequest) -> None:
    """Rewards v2 (rewards-optimizer-plan §4): a cursor-reset re-sync redelivers existing Plaid
    rows now carrying ``card_id`` + PFC. Fill those in on rows that predate the feature — only
    when currently empty, never clobbering a value — so the historical backfill is idempotent."""
    changed = False
    if existing.card_id is None and payload.card_id is not None:
        existing.card_id = payload.card_id
        changed = True
    if existing.pfc_primary is None and payload.pfc_primary is not None:
        existing.pfc_primary = payload.pfc_primary
        changed = True
    if existing.pfc_detailed is None and payload.pfc_detailed is not None:
        existing.pfc_detailed = payload.pfc_detailed
        changed = True
    if changed:
        db.add(existing)
        db.flush()


def _open_review(db: Session, user_id: str, *, incoming: Transaction, matched: Transaction) -> None:
    """Record a pending unattended match for the needs-review queue (plan §6.3)."""
    db.add(
        ReconciliationReview(
            user_id=user_id,
            incoming_transaction_id=incoming.id,
            matched_transaction_id=matched.id,
            match_score=match_score(
                incoming.purchased_on,
                incoming.total_cents,
                matched.purchased_on,
                matched.total_cents,
            ),
        )
    )


def _add_line_items(db: Session, user_id: str, transaction_id, payload: IngestRequest) -> None:
    cat_map: dict[str, str] | None = None  # lazily built name→id for auto-categorization
    for position, item in enumerate(payload.line_items):
        category_id = item.category_id
        if category_id is None:
            # No category supplied (manual entry / bank row) → run the shared classifier
            # and resolve to this user's category id, falling back to Other.
            if cat_map is None:
                cat_map = {
                    c.name: str(c.id)
                    for c in db.exec(select(Category).where(Category.user_id == user_id)).all()
                }
            name = categorize(name=item.raw_name, plaid_pfc=item.plaid_pfc)
            # Hybrid: if the deterministic classifier can't place a MANUAL entry, escalate to
            # the Gemini fallback (bank rows already have Plaid's strong PFC signal, and a
            # bulk sync shouldn't fan out LLM calls). Degrades to "Other" if Gemini is off.
            if (
                name == "Other"
                and payload.source == TransactionSource.manual
                and (item.raw_name or "").strip()
            ):
                name = classify_category(item.raw_name)
            category_id = cat_map.get(name) or cat_map.get("Other")
        db.add(
            LineItem(
                user_id=user_id,
                transaction_id=transaction_id,
                position=position,  # preserve the order the items arrived in
                raw_name=item.raw_name,
                normalized_name=item.normalized_name,
                category_id=category_id,
                price_cents=item.price_cents,  # line-extended total (qty x unit)
                quantity=item.quantity,
                unit_size=item.unit_size,
                unit=item.unit,
            )
        )


def _to_out(txn: Transaction) -> TransactionOut:
    return TransactionOut(
        id=str(txn.id),
        vendor=txn.vendor,
        purchased_on=txn.purchased_on,
        source=txn.source,
        total_cents=txn.total_cents,
        currency=txn.currency,
        review_status=txn.review_status,
    )


def _match_out(db: Session, user_id: str, matched: Transaction) -> ReconcileMatch:
    item_count = db.exec(
        select(func.count())
        .select_from(LineItem)
        .where(LineItem.transaction_id == matched.id, LineItem.user_id == user_id)
    ).one()
    return ReconcileMatch(
        matched_transaction_id=str(matched.id),
        vendor=matched.vendor,
        purchased_on=matched.purchased_on,
        source=matched.source,
        total_cents=matched.total_cents,
        item_count=item_count,
    )
