"""Data model package. Importing this registers every table on ``SQLModel.metadata``
so Alembic autogenerate and the app both see the full schema."""

from app.models.enums import (
    AccountStatus,
    LinkedAccountSource,
    Resolution,
    ReviewStatus,
    StoreType,
    SubstitutionTightness,
    SyncMode,
    TransactionSource,
)
from app.models.tables import (
    Category,
    CategoryOverride,
    ComparableSpec,
    LineItem,
    LinkedAccount,
    PriceQuote,
    ReconciliationReview,
    RecurringItem,
    Transaction,
)

__all__ = [
    "AccountStatus",
    "LinkedAccountSource",
    "Resolution",
    "ReviewStatus",
    "StoreType",
    "SubstitutionTightness",
    "SyncMode",
    "TransactionSource",
    "Category",
    "CategoryOverride",
    "ComparableSpec",
    "LineItem",
    "LinkedAccount",
    "PriceQuote",
    "ReconciliationReview",
    "RecurringItem",
    "Transaction",
]
