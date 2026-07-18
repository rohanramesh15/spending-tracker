"""Pydantic request/response models for the API.

Money is always integer cents on the wire too (CLAUDE.md #1) — the frontend divides
by 100 only at the render edge.
"""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import AccountStatus, Resolution, ReviewStatus, TransactionSource


class LineItemIn(BaseModel):
    raw_name: str
    normalized_name: str | None = None
    category_id: str | None = None
    # Transient categorization hint (Plaid PFC primary); NOT stored — when category_id is
    # absent, ingest uses this + the item name to auto-assign a category via categorize().
    plaid_pfc: str | None = None
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
    linked_account_id: str | None = None
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
    - ``needs_decision`` — an *attended* semantic duplicate was found; nothing saved yet.
    - ``needs_review`` — an *unattended* (Plaid) match; the incoming was saved as
      needs_review and parked in the reconciliation queue (never auto-merged).
    - ``exists`` — idempotent redelivery; the already-stored transaction is returned.
    """

    status: Literal["created", "resolved", "skipped", "needs_decision", "needs_review", "exists"]
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
    categories: list[str] = Field(default_factory=list)  # distinct line-item categories, for chips


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


# --- Reconciliation review queue (Phase 3, unattended) -------------------------


class ReviewTxn(BaseModel):
    """A transaction as it appears on a review card (both sides of the match)."""

    id: str
    vendor: str
    purchased_on: date
    source: TransactionSource
    total_cents: int
    review_status: ReviewStatus
    item_count: int


class ReviewOut(BaseModel):
    """One open review: the incoming (unattended) transaction vs. its matched existing
    one, with a human-readable match reason for the card."""

    id: str
    created_at: datetime
    match_score: Decimal | None
    reason: str
    incoming: ReviewTxn
    matched: ReviewTxn


class ReviewResolveRequest(BaseModel):
    resolution: Resolution


class ReviewResolveResult(BaseModel):
    status: Literal["resolved"]
    resolution: Resolution
    # The surviving transaction (the merged/kept row), for the client to navigate to.
    transaction_id: str


# --- Bank sync (Phase 3, Plaid) ------------------------------------------------


class LinkTokenOut(BaseModel):
    link_token: str


class ExchangeRequest(BaseModel):
    public_token: str


class UpdateLinkTokenRequest(BaseModel):
    """Which existing connection to open in Plaid update mode (reconnect / add accounts)."""

    linked_account_id: str


class LinkedAccountOut(BaseModel):
    """A connected account for the Settings list (labeled 'Connected accounts', never
    'Plaid' — CLAUDE.md)."""

    id: str
    institution: str
    status: AccountStatus
    is_apple_card: bool
    last_synced_at: datetime | None


class AccountSyncResult(BaseModel):
    """Per-account outcome of a sync, so the UI can show what actually happened instead of a
    bare 'synced' — including accounts that couldn't sync (reconnect needed)."""

    account_id: str
    institution: str
    status: AccountStatus
    added: int = 0
    needs_review: int = 0
    removed: int = 0
    skipped: int = (
        0  # pulled from Plaid but filtered out (income, incoming transfers, card payments, pending)
    )
    needs_attention: bool = False  # couldn't sync — reconnect/consent required
    message: str | None = None


class SyncSummary(BaseModel):
    added: int  # confirmed straight in (no match)
    needs_review: int  # parked in the reconciliation queue (matched an existing entry)
    removed: int  # deleted because Plaid dropped them (e.g. a pending txn that cleared)
    accounts: list[AccountSyncResult] = Field(default_factory=list)


class ExchangeResult(BaseModel):
    account: LinkedAccountOut
    synced: SyncSummary


class ImportSummary(BaseModel):
    """Outcome of a CSV import (Apple Card), through the one ingest door."""

    imported: int  # new transactions added straight in (no match)
    needs_review: int  # matched an existing entry → parked in the review queue
    duplicates: int  # already imported (idempotent re-upload)
    skipped: int  # non-purchase rows (payments, credits, unparseable)


# (Recurring-items + cheaper-store-finder schemas removed 2026-07-17.)
