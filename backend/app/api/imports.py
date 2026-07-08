"""Manual imports, routed through the one ingest door (user-flow §9).

Apple Card CSV upload → parse → ingest each purchase as ``source=plaid`` attached to an
Apple Card ``linked_account`` (plan §11: Apple Card rides the Plaid pipeline; the CSV is
its permanent manual fallback). Because it's ``source=plaid`` it takes the *unattended*
path, so a purchase that semantically matches an existing receipt/manual entry lands in
the needs-review queue — never auto-merged (CLAUDE.md #5). Re-uploading the same export is
idempotent via a stable per-row ``external_id``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.api.ingest import ingest as ingest_transaction
from app.api.schemas import ImportSummary, IngestRequest
from app.core.auth import current_user_id, get_db
from app.models.enums import (
    AccountStatus,
    LinkedAccountSource,
    SyncMode,
    TransactionSource,
)
from app.models.tables import LinkedAccount
from app.services.apple_card_csv import parse_apple_card_csv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["imports"])

MAX_CSV_BYTES = 5 * 1024 * 1024  # a statement export is tiny; guard anyway


@router.post("/apple-card", response_model=ImportSummary)
async def import_apple_card(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ImportSummary:
    raw = await file.read()
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large")

    try:
        rows, skipped = parse_apple_card_csv(raw)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    account = _get_or_create_apple_card(db, user_id)

    imported = needs_review = duplicates = 0
    for row in rows:
        outcome = ingest_transaction(
            IngestRequest(
                source=TransactionSource.plaid,
                external_id=row.external_id,
                linked_account_id=str(account.id),
                vendor=row.vendor,
                purchased_on=row.purchased_on,
                total_cents=row.total_cents,
            ),
            db=db,
            user_id=user_id,
        )
        if outcome.status == "created":
            imported += 1
        elif outcome.status == "needs_review":
            needs_review += 1
        elif outcome.status == "exists":
            duplicates += 1

    return ImportSummary(
        imported=imported,
        needs_review=needs_review,
        duplicates=duplicates,
        skipped=skipped,
    )


def _get_or_create_apple_card(db: Session, user_id: str) -> LinkedAccount:
    """One Apple Card 'connected account' per user (is_apple_card, device sync mode)."""
    account = db.exec(
        select(LinkedAccount).where(
            LinkedAccount.user_id == user_id,
            LinkedAccount.is_apple_card == True,  # noqa: E712 - SQL boolean, not Python
        )
    ).first()
    if account is None:
        account = LinkedAccount(
            user_id=user_id,
            institution="Apple Card",
            source=LinkedAccountSource.manual,
            is_apple_card=True,
            sync_mode=SyncMode.device,
            status=AccountStatus.active,
        )
        db.add(account)
        db.flush()
    return account
