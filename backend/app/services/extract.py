"""Receipt extraction behind ONE swappable function: ``extract_receipt()`` (plan §5, §6.1).

Currently Gemini 2.5 Flash (free tier). No Gemini types leak past this module — callers
get a validated ``ExtractedReceipt``. If no API key is configured, a deterministic mock
is returned so the entire scan → confirm → ingest flow is testable without a key.

The prompt embeds the fixed taxonomy (plan §9) and pins normalization conventions; the
model must pick a category from the list (fallback ``Other``), never invent one — enforced
again here by a Pydantic validator.
"""

from __future__ import annotations

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
        "- quantity: how many units of that line were bought (a number, default 1); "
        "price_cents is the total for all of them.\n"
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


# --- Gemini wire schema -------------------------------------------------------------
# Gemini's controlled generation (response_schema) reliably supports only primitive JSON
# types — OBJECT/STRING/INTEGER/NUMBER/ARRAY/BOOL and string enums. It does NOT support
# ``Decimal`` (renders as a STRING with a regex ``pattern``) or ``date`` (a ``format``),
# so handing it the public ``ExtractedReceipt`` risks a rejected request. We give Gemini a
# clean primitive schema, then convert into the domain model (Decimal/date + the category
# whitelist) here, so no Gemini/SDK type ever leaks past this module (CLAUDE.md §extract).


class _WireLineItem(BaseModel):
    raw_name: str
    normalized_name: str | None = None
    category: str = "Other"
    price_cents: int
    quantity: float = 1.0  # NUMBER on the wire; converted to Decimal on the way out


class _WireReceipt(BaseModel):
    vendor: str
    purchased_on: str  # "YYYY-MM-DD" string; parsed to a local date on the way out
    subtotal_cents: int | None = None
    tax_cents: int = 0
    tip_cents: int = 0
    total_cents: int
    currency: str = "USD"
    line_items: list[_WireLineItem] = Field(default_factory=list)


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
            response_schema=_WireReceipt,
            temperature=0.0,
        ),
    )
    return _to_extracted(_parse_wire(response))


def _parse_wire(response: object) -> _WireReceipt:
    """Pull a ``_WireReceipt`` out of the SDK response (parsed object, else raw JSON)."""
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, _WireReceipt):
        return parsed
    text = getattr(response, "text", None)
    if not text:
        raise ValueError("Gemini returned no usable content")
    return _WireReceipt.model_validate_json(text)


def _to_extracted(w: _WireReceipt) -> ExtractedReceipt:
    """Convert the primitive wire model into the domain model.

    Pydantic coerces the ``purchased_on`` string to a local ``date``; quantities go through
    ``Decimal(str(...))`` to avoid binary-float drift; the ``category`` validator on
    ``ExtractedLineItem`` coerces anything outside the taxonomy to ``Other``.
    """
    return ExtractedReceipt(
        vendor=w.vendor,
        purchased_on=w.purchased_on,
        subtotal_cents=w.subtotal_cents,
        tax_cents=w.tax_cents,
        tip_cents=w.tip_cents,
        total_cents=w.total_cents,
        currency=w.currency,
        line_items=[
            ExtractedLineItem(
                raw_name=li.raw_name,
                normalized_name=li.normalized_name,
                category=li.category,
                price_cents=li.price_cents,
                quantity=Decimal(str(li.quantity)),
            )
            for li in w.line_items
        ],
    )


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
