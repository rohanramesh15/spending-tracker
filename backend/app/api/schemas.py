"""Pydantic request/response models for the API.

Money is always integer cents on the wire too (CLAUDE.md #1) — the frontend divides
by 100 only at the render edge.
"""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import ReviewStatus, TransactionSource


class LineItemIn(BaseModel):
    raw_name: str
    normalized_name: str | None = None
    category_id: str | None = None
    # Line-extended total in cents (quantity x unit price) — matches what receipts print.
    price_cents: int
    quantity: Decimal = Decimal(1)
    unit_size: Decimal | None = None
    unit: str | None = None


class IngestRequest(BaseModel):
    """The one ingest door (plan §6.3). Every source posts this shape."""

    source: TransactionSource
    external_id: str | None = None
    vendor: str
    purchased_on: date
    purchased_time: time | None = None
    subtotal_cents: int | None = None
    tax_cents: int = 0
    tip_cents: int = 0
    total_cents: int
    currency: str = "USD"
    line_items: list[LineItemIn] = Field(default_factory=list)
    raw_extraction_json: dict | None = None


class TransactionOut(BaseModel):
    id: str
    vendor: str
    purchased_on: date
    source: TransactionSource
    total_cents: int
    currency: str
    review_status: ReviewStatus
