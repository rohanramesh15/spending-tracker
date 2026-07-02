"""The single source-agnostic ingest door: ``POST /api/ingest`` (plan §6.3).

Manual, receipt, Plaid, and the future Apple Card agent all post here. This scaffold
implements the idempotent insert path (dedupe on ``(source, external_id)``); attended
reconciliation, the needs-review queue, and item matching are wired in Phases 2–3.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.schemas import IngestRequest, TransactionOut
from app.core.auth import current_user_id, get_db
from app.models.tables import LineItem, Transaction

router = APIRouter(prefix="/api", tags=["ingest"])


@router.post("/ingest", response_model=TransactionOut, status_code=201)
def ingest(
    payload: IngestRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> TransactionOut:
    # NOTE: reconciliation (attended dialog / unattended needs-review queue) lands in
    # Phases 2–3. Idempotency on (source, external_id) is enforced by the DB unique
    # constraint; a full upsert-or-return path is added with reconciliation.
    txn = Transaction(
        user_id=user_id,
        vendor=payload.vendor,
        purchased_on=payload.purchased_on,
        purchased_time=payload.purchased_time,
        source=payload.source,
        external_id=payload.external_id,
        subtotal_cents=payload.subtotal_cents,
        tax_cents=payload.tax_cents,
        tip_cents=payload.tip_cents,
        total_cents=payload.total_cents,
        currency=payload.currency,
        raw_extraction_json=payload.raw_extraction_json,
    )
    db.add(txn)
    db.flush()  # assign txn.id within the request transaction

    for position, item in enumerate(payload.line_items):
        db.add(
            LineItem(
                user_id=user_id,
                transaction_id=txn.id,
                position=position,  # preserve the order the items arrived in
                raw_name=item.raw_name,
                normalized_name=item.normalized_name,
                category_id=item.category_id,
                price_cents=item.price_cents,  # line-extended total (qty x unit)
                quantity=item.quantity,
                unit_size=item.unit_size,
                unit=item.unit,
            )
        )

    return TransactionOut(
        id=str(txn.id),
        vendor=txn.vendor,
        purchased_on=txn.purchased_on,
        source=txn.source,
        total_cents=txn.total_cents,
        currency=txn.currency,
        review_status=txn.review_status,
    )
