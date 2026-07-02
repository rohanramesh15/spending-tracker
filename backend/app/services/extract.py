"""Receipt extraction behind ONE swappable function: ``extract_receipt()`` (plan §5, §6.1).

Currently Gemini 2.5 Flash (free tier). No Gemini types leak past this module — callers
get a validated ``ExtractedReceipt``. If no API key is configured, a deterministic mock
is returned so the entire scan → confirm → ingest flow is testable without a key.

The prompt embeds the fixed taxonomy (plan §9) and pins normalization conventions; the
model must pick a category from the list (fallback ``Other``), never invent one — enforced
again here by a Pydantic validator.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.config import get_settings
from app.core.taxonomy import REGULAR_CATEGORIES

logger = logging.getLogger(__name__)

_REGULAR = set(REGULAR_CATEGORIES)


class ExtractedLineItem(BaseModel):
    raw_name: str
    normalized_name: str | None = None
    category: str = "Other"
    price_cents: int  # line-extended total (qty x unit), integer cents
    quantity: Decimal = Decimal(1)

    @field_validator("category")
    @classmethod
    def _valid_category(cls, v: str) -> str:
        # The model must choose from the taxonomy; coerce anything else to Other.
        return v if v in _REGULAR else "Other"


class ExtractedReceipt(BaseModel):
    vendor: str
    purchased_on: date
    subtotal_cents: int | None = None
    tax_cents: int = 0
    tip_cents: int = 0
    total_cents: int
    currency: str = "USD"
    line_items: list[ExtractedLineItem] = Field(default_factory=list)


def _prompt() -> str:
    cats = ", ".join(REGULAR_CATEGORIES)
    return (
        "You are a receipt-extraction engine. Read this receipt image and return JSON "
        "matching the schema. Rules:\n"
        "- All money is INTEGER CENTS (e.g. $3.99 -> 399). Never use decimals or floats.\n"
        "- price_cents is the line-extended total (quantity x unit price) as printed.\n"
        "- purchased_on is the receipt's local calendar date (YYYY-MM-DD). Do not convert "
        "time zones.\n"
        "- tax and tip are the transaction-level amounts (0 if none).\n"
        f"- Each line item's category MUST be one of exactly: {cats}. If unsure, use "
        "'Other'. Do NOT invent categories. Tax and tip are NOT line items.\n"
        "- normalized_name: lowercase, generic noun first (e.g. 'GV MILK 2%' -> "
        "'milk, 2%') so the same product matches across vendors and brands.\n"
        "- Handle edge cases (no tax, restaurant tip, multi-item, deposits, BOGO) by "
        "reading what's printed, not by guessing."
    )


def extract_receipt(image_bytes: bytes, mime_type: str = "image/jpeg") -> ExtractedReceipt:
    """Extract a structured receipt from normalized image bytes."""
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.info("GEMINI_API_KEY unset — using mock extractor")
        return _extract_mock()
    return _extract_gemini(image_bytes, mime_type, settings.gemini_api_key, settings.gemini_model)


def _extract_gemini(
    image_bytes: bytes, mime_type: str, api_key: str, model: str
) -> ExtractedReceipt:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=[
            _prompt(),
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExtractedReceipt,
            temperature=0.0,
        ),
    )
    # Prefer the SDK's parsed object; fall back to parsing the raw text.
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, ExtractedReceipt):
        return parsed
    return ExtractedReceipt.model_validate(json.loads(response.text))


def _extract_mock() -> ExtractedReceipt:
    """Deterministic sample so the scan/confirm/ingest flow works with no API key."""
    return ExtractedReceipt(
        vendor="Test Market",
        purchased_on=date(2026, 7, 2),
        subtotal_cents=1177,
        tax_cents=71,
        tip_cents=0,
        total_cents=1248,
        currency="USD",
        line_items=[
            ExtractedLineItem(
                raw_name="GV MILK 2% GAL",
                normalized_name="milk, 2%",
                category="Dairy",
                price_cents=399,
                quantity=Decimal(1),
            ),
            ExtractedLineItem(
                raw_name="ORG BANANAS",
                normalized_name="bananas",
                category="Produce",
                price_cents=129,
                quantity=Decimal(1),
            ),
            ExtractedLineItem(
                raw_name="SOURDOUGH LOAF",
                normalized_name="bread, sourdough",
                category="Bakery",
                price_cents=449,
                quantity=Decimal(1),
            ),
            ExtractedLineItem(
                raw_name="PAPER TOWELS 6PK",
                normalized_name="paper towels",
                category="Household",
                price_cents=200,
                quantity=Decimal(1),
            ),
        ],
    )
