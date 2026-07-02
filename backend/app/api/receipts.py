"""Receipt extraction endpoint (plan §6.1, Phase 2).

Synchronous flow: the SPA POSTs the photo → we normalize it → extract with
``extract_receipt()`` → resolve categories → return a draft to prefill the confirm
screen. On confirm the SPA calls POST /api/ingest with source="receipt".

Privacy note: the photo is held only for the duration of this request and never
persisted (so there's nothing to delete on confirm); ``raw_extraction_json`` is the
permanent record. This is a deliberate simplification of §6.1's transient-Storage step —
it's strictly more privacy-preserving. Revisit if a re-run/Textract fallback needs the
image after extraction.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.api.schemas import ReceiptDraft, ReceiptDraftItem
from app.core.auth import current_user_id, get_db
from app.models.tables import Category
from app.services.extract import extract_receipt
from app.services.images import normalize_image

router = APIRouter(prefix="/api", tags=["receipts"])

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB — phone photos are well under this


@router.post("/receipts/extract", response_model=ReceiptDraft)
async def extract(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ReceiptDraft:
    raw = await file.read()
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty upload")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image too large")

    try:
        normalized = normalize_image(raw)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Couldn't read this image") from exc

    receipt = extract_receipt(normalized, mime_type="image/jpeg")

    # Resolve category names -> the user's seeded category ids.
    name_to_id = {
        c.name: str(c.id)
        for c in db.exec(select(Category).where(Category.user_id == user_id)).all()
    }

    items = [
        ReceiptDraftItem(
            raw_name=li.raw_name,
            normalized_name=li.normalized_name,
            category_id=name_to_id.get(li.category),
            category_name=li.category,
            price_cents=li.price_cents,
            quantity=li.quantity,
        )
        for li in receipt.line_items
    ]

    return ReceiptDraft(
        vendor=receipt.vendor,
        purchased_on=receipt.purchased_on,
        subtotal_cents=receipt.subtotal_cents,
        tax_cents=receipt.tax_cents,
        tip_cents=receipt.tip_cents,
        total_cents=receipt.total_cents,
        currency=receipt.currency,
        line_items=items,
        raw_extraction_json=receipt.model_dump(mode="json"),
    )
