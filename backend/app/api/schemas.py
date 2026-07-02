"""Pydantic request/response models for the API.

Money is always integer cents on the wire too (CLAUDE.md #1) — the frontend divides
by 100 only at the render edge.
"""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import Resolution, ReviewStatus, TransactionSource


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
    """The one ingest door (plan §6.3). Every source posts this shape.

    ``resolution`` + ``matched_transaction_id`` are set only on the *second* call of an
    attended reconciliation: the first call returns a ``needs_decision`` match, the user
    picks merge/skip/replace/keep-both, and the client re-POSTs the same payload with the
    chosen resolution attached (CLAUDE.md #4/#5)."""

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

    resolution: Resolution | None = None
    matched_transaction_id: str | None = None


class TransactionOut(BaseModel):
    id: str
    vendor: str
    purchased_on: date
    source: TransactionSource
    total_cents: int
    currency: str
    review_status: ReviewStatus


class ReconcileMatch(BaseModel):
    """The existing transaction a fresh attended ingest collided with — enough for the
    client to render the merge/skip/replace/keep-both dialog."""

    matched_transaction_id: str
    vendor: str
    purchased_on: date
    source: TransactionSource
    total_cents: int
    item_count: int


class IngestResult(BaseModel):
    """The ingest door's outcome. ``needs_decision`` writes nothing and carries ``match``
    for the attended dialog; every other status carries the resulting ``transaction``.

    - ``created``  — inserted a new transaction (no match, or keep-both).
    - ``resolved`` — applied a merge or replace against ``match``.
    - ``skipped``  — user discarded the incoming; the existing transaction is returned.
    - ``needs_decision`` — a semantic duplicate was found; nothing saved yet.
    """

    status: Literal["created", "resolved", "skipped", "needs_decision"]
    transaction: TransactionOut | None = None
    match: ReconcileMatch | None = None


# --- Read models ---------------------------------------------------------------


class CategoryOut(BaseModel):
    id: str
    name: str
    is_system: bool


class LineItemOut(BaseModel):
    id: str
    position: int
    raw_name: str
    normalized_name: str | None
    category_id: str | None
    category_name: str | None
    price_cents: int
    quantity: Decimal
    unit_size: Decimal | None
    unit: str | None


class TransactionListItem(BaseModel):
    id: str
    vendor: str
    purchased_on: date
    source: TransactionSource
    total_cents: int
    currency: str
    review_status: ReviewStatus
    item_count: int


class TransactionDetail(TransactionListItem):
    purchased_time: time | None
    subtotal_cents: int | None
    tax_cents: int
    tip_cents: int
    line_items: list[LineItemOut]


class SpendingSlice(BaseModel):
    category: str
    cents: int


class SpendingResponse(BaseModel):
    """Pie data for a date range, computed with the §6.6 aggregation rule."""

    start: date
    end: date
    total_cents: int
    slices: list[SpendingSlice]


# --- Receipt extraction (Phase 2) ----------------------------------------------


class ReceiptDraftItem(BaseModel):
    raw_name: str
    normalized_name: str | None
    category_id: str | None
    category_name: str | None
    price_cents: int
    quantity: Decimal


class ReceiptDraft(BaseModel):
    """The extraction result, resolved against the user's categories, ready to prefill
    the confirm screen. `raw_extraction_json` is echoed back on confirm and becomes the
    permanent record (the photo is not retained)."""

    vendor: str
    purchased_on: date
    subtotal_cents: int | None
    tax_cents: int
    tip_cents: int
    total_cents: int
    currency: str
    line_items: list[ReceiptDraftItem]
    raw_extraction_json: dict
