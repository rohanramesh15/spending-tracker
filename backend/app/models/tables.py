"""The Postgres data model (plan §5), expressed as SQLModel tables.

Global rules (plan §5 header):
- All money columns are integer cents (``*_cents BIGINT``) — see ``base.money_cents``.
- Every user-data table carries ``user_id`` with an RLS policy (added in the migration).
  Child tables (e.g. ``line_items``) denormalize ``user_id`` from their parent so each can
  have a simple ``user_id = auth.uid()`` policy.
- ``purchased_on`` is a local calendar DATE plus optional ``purchased_time`` — never a
  fake-precision UTC timestamp.

Ownership integrity: child rows are tied to their parent's owner via **composite,
owner-scoped foreign keys** ``(user_id, parent_id) → parent(user_id, id)``, defined in
migration 0001 (SQLModel can't express composite FKs cleanly, so the per-column
``ForeignKey`` here is ORM metadata only — the migration is authoritative; do not blindly
`alembic revision --autogenerate` against these models).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

from app.models.base import (
    created_at_col,
    money_cents,
    nullable_timestamp,
    user_id_col,
    uuid_pk,
)
from app.models.enums import (
    AccountStatus,
    LinkedAccountSource,
    Resolution,
    ReviewStatus,
    SyncMode,
    TransactionSource,
)


def _fk(target: str, *, nullable: bool = False, ondelete: str = "CASCADE"):
    return Column(
        PGUUID(as_uuid=True),
        ForeignKey(target, ondelete=ondelete),
        nullable=nullable,
        index=True,
    )


class LinkedAccount(SQLModel, table=True):
    """Connected sources. UI labels these 'Connected accounts', never 'Plaid'.
    Apple Card is a Plaid account with ``is_apple_card=true`` + ``sync_mode=device``."""

    __tablename__ = "linked_accounts"

    id: uuid.UUID = uuid_pk()
    user_id: uuid.UUID = user_id_col()
    institution: str = Field(sa_column=Column(String, nullable=False))
    account_type: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    source: LinkedAccountSource = Field(sa_column=Column(String, nullable=False))
    external_account_id: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    is_apple_card: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default="false")
    )
    sync_mode: SyncMode = Field(
        default=SyncMode.server, sa_column=Column(String, nullable=False, server_default="server")
    )
    status: AccountStatus = Field(
        default=AccountStatus.active,
        sa_column=Column(String, nullable=False, server_default="active"),
    )
    # Plaid Item state (Phase 3, migration 0002). access_token is the per-Item secret,
    # stored on the row (RLS-protected, disk-encrypted) rather than SSM — a deliberate
    # deviation from the plan's §6.7 SSM note (dynamic per-user tokens don't fit boot-time
    # SSM hydration and can't work in local dev). item_id is Plaid's Item id; the cursor
    # drives incremental /transactions/sync.
    access_token: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    item_id: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    transactions_cursor: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    last_synced_at: datetime | None = nullable_timestamp()
    created_at: datetime = created_at_col()


class Transaction(SQLModel, table=True):
    """One purchase from any source. Idempotent on ``(source, external_id)``.
    ``receipt_image_path`` is transient — nulled after confirm when the photo is
    deleted; ``raw_extraction_json`` is the permanent record (plan §5, §6.1)."""

    __tablename__ = "transactions"
    __table_args__ = (
        # Per-user idempotency (multi-tenant safe).
        UniqueConstraint(
            "user_id", "source", "external_id", name="uq_transactions_user_source_external"
        ),
        # Owner-scoped composite key target for child FKs (see migration).
        UniqueConstraint("user_id", "id", name="uq_transactions_user_id"),
    )

    id: uuid.UUID = uuid_pk()
    user_id: uuid.UUID = user_id_col()
    # Which connected account this came from (nullable; §5 deviation for the Settings
    # view + per-account filtering in Phase 3). SET NULL if the account is removed.
    linked_account_id: uuid.UUID | None = Field(
        default=None, sa_column=_fk("linked_accounts.id", nullable=True, ondelete="SET NULL")
    )
    vendor: str = Field(sa_column=Column(String, nullable=False))
    purchased_on: date = Field(sa_column=Column(Date, nullable=False, index=True))
    purchased_time: time | None = Field(default=None, sa_column=Column(Time, nullable=True))
    source: TransactionSource = Field(sa_column=Column(String, nullable=False))
    external_id: str | None = Field(default=None, sa_column=Column(String, nullable=True))

    subtotal_cents: int | None = money_cents(nullable=True)
    tax_cents: int = money_cents(nullable=False, default=0)
    tip_cents: int = money_cents(nullable=False, default=0)
    total_cents: int = money_cents(nullable=False)
    currency: str = Field(
        default="USD", sa_column=Column(String(3), nullable=False, server_default="USD")
    )

    receipt_image_path: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    raw_extraction_json: dict | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    review_status: ReviewStatus = Field(
        default=ReviewStatus.confirmed,
        sa_column=Column(String, nullable=False, server_default="confirmed", index=True),
    )
    created_at: datetime = created_at_col()


class LineItem(SQLModel, table=True):
    """A single line on a transaction. ``user_id`` is denormalized for RLS."""

    __tablename__ = "line_items"

    id: uuid.UUID = uuid_pk()
    user_id: uuid.UUID = user_id_col()
    transaction_id: uuid.UUID = Field(sa_column=_fk("transactions.id"))
    # Order on the receipt (UUID PKs don't sort by insertion). Assigned in ingest.
    position: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    raw_name: str = Field(sa_column=Column(String, nullable=False))
    normalized_name: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    category_id: uuid.UUID | None = Field(
        default=None, sa_column=_fk("categories.id", nullable=True, ondelete="SET NULL")
    )
    # LINE-EXTENDED total (quantity x unit price).
    price_cents: int = money_cents(nullable=False)
    quantity: Decimal = Field(
        default=Decimal(1),
        sa_column=Column(Numeric(12, 3), nullable=False, server_default="1"),
    )
    unit_size: Decimal | None = Field(default=None, sa_column=Column(Numeric(12, 3), nullable=True))
    unit: str | None = Field(default=None, sa_column=Column(String, nullable=True))


class Category(SQLModel, table=True):
    """The fixed taxonomy (plan §9), seeded per user by a trigger on signup.
    Tax and Tip are ``is_system`` categories. The LLM must pick from this list."""

    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
        UniqueConstraint("user_id", "id", name="uq_categories_user_id"),
    )

    id: uuid.UUID = uuid_pk()
    user_id: uuid.UUID = user_id_col()
    name: str = Field(sa_column=Column(String, nullable=False))
    is_system: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default="false")
    )


class CategoryOverride(SQLModel, table=True):
    """Remembers user corrections to bias future categorization (plan §6.4).
    Keyed on the normalized item name per user."""

    __tablename__ = "category_overrides"
    __table_args__ = (
        UniqueConstraint("user_id", "normalized_name", name="uq_overrides_user_name"),
    )

    id: uuid.UUID = uuid_pk()
    user_id: uuid.UUID = user_id_col()
    normalized_name: str = Field(sa_column=Column(String, nullable=False))
    category_id: uuid.UUID = Field(sa_column=_fk("categories.id"))
    created_at: datetime = created_at_col()


class ReconciliationReview(SQLModel, table=True):
    """The pending-review queue. Populated whenever an *unattended* ingest finds a
    semantic match; nothing is ever auto-merged (plan §5, §6.3)."""

    __tablename__ = "reconciliation_reviews"

    id: uuid.UUID = uuid_pk()
    user_id: uuid.UUID = user_id_col()
    incoming_transaction_id: uuid.UUID = Field(sa_column=_fk("transactions.id"))
    matched_transaction_id: uuid.UUID = Field(sa_column=_fk("transactions.id"))
    match_score: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(5, 4), nullable=True)
    )
    created_at: datetime = created_at_col()
    resolved_at: datetime | None = nullable_timestamp()
    resolution: Resolution | None = Field(default=None, sa_column=Column(String, nullable=True))


class Card(SQLModel, table=True):
    """A single card/account under a connected ``LinkedAccount`` (rewards-optimizer-plan §3).

    ``LinkedAccount`` is one row per Plaid *Item* (bank login); a Card is one row per Plaid
    *account* within it, carrying the matched reward profile. Created from Plaid
    ``/accounts/get`` on link (v1); ``Transaction.card_id`` attributes each purchase to a
    card in v2. ``reward_profile_key`` is the matched/confirmed ``reward_kb`` seed key;
    ``reward_profile_source`` records how it was set (matched/user/llm/tavily). The migration
    owns the owner-scoped composite FK ``(user_id, linked_account_id)``; the single-column
    ``_fk`` here is ORM metadata only."""

    __tablename__ = "cards"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "linked_account_id", "plaid_account_id", name="uq_cards_account"
        ),
    )

    id: uuid.UUID = uuid_pk()
    user_id: uuid.UUID = user_id_col()
    linked_account_id: uuid.UUID = Field(sa_column=_fk("linked_accounts.id"))
    plaid_account_id: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    name: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    official_name: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    mask: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    subtype: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    reward_profile_key: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    reward_profile_source: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    is_active: bool = Field(
        default=True, sa_column=Column(Boolean, nullable=False, server_default="true")
    )
    created_at: datetime = created_at_col()
    updated_at: datetime = created_at_col()  # set by the app on every upsert/profile change


# (Recurring-item detection + the cheaper-store finder — RecurringItem, ComparableSpec,
# PriceQuote — were removed 2026-07-17; their tables are dropped in migration 0005.)
