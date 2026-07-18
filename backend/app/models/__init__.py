"""Data model package. Importing this registers every table on ``SQLModel.metadata``
so Alembic autogenerate and the app both see the full schema."""

from app.models.enums import (
    AccountStatus,
    LinkedAccountSource,
    NotificationKind,
    Resolution,
    ReviewStatus,
    SubscriptionStatus,
    SyncMode,
    TransactionSource,
)
from app.models.tables import (
    Card,
    Category,
    CategoryOverride,
    LineItem,
    LinkedAccount,
    Notification,
    ReconciliationReview,
    Subscription,
    Transaction,
)

__all__ = [
    "AccountStatus",
    "LinkedAccountSource",
    "NotificationKind",
    "Resolution",
    "ReviewStatus",
    "SubscriptionStatus",
    "SyncMode",
    "TransactionSource",
    "Card",
    "Category",
    "CategoryOverride",
    "LineItem",
    "LinkedAccount",
    "Notification",
    "ReconciliationReview",
    "Subscription",
    "Transaction",
]
