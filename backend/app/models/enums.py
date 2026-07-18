"""Enumerations used across the data model (plan §5).

Stored as plain lowercase strings (VARCHAR) rather than native PG enums so the
taxonomy of values can evolve without a fragile ``ALTER TYPE`` migration.
"""

from enum import StrEnum


class TransactionSource(StrEnum):
    """How a transaction entered the system. Apple Card arrives later as ``plaid``
    (it rides Plaid's pipeline), distinguished only by its linked_accounts row."""

    receipt = "receipt"
    manual = "manual"
    plaid = "plaid"


class LinkedAccountSource(StrEnum):
    plaid = "plaid"
    manual = "manual"


class SyncMode(StrEnum):
    """Chase etc. sync server-side; Apple Card is device-mediated via the iOS agent."""

    server = "server"
    device = "device"


class AccountStatus(StrEnum):
    active = "active"
    needs_reauth = "needs_reauth"
    disconnected = "disconnected"


class ReviewStatus(StrEnum):
    """``needs_review`` transactions are parked pending reconciliation and are
    excluded from charts until resolved (plan §6.3, §6.6)."""

    confirmed = "confirmed"
    needs_review = "needs_review"


class Resolution(StrEnum):
    merge = "merge"
    skip = "skip"
    replace = "replace"
    keep_both = "keep_both"


class SubscriptionStatus(StrEnum):
    """Lifecycle of a detected subscription (docs/subscriptions-plan.md §4).

    ``detected`` is the machine default; the other three are user- or scan-set and are never
    overwritten by a recompute. ``dismissed``/``cancelled`` are hidden from the default view.
    """

    detected = "detected"
    confirmed = "confirmed"
    dismissed = "dismissed"
    cancelled = "cancelled"


class NotificationKind(StrEnum):
    """A subscription alert surfaced by the daily scan (docs/subscriptions-plan.md §5)."""

    new = "new"
    price_increased = "price_increased"
    upcoming = "upcoming"
    likely_cancelled = "likely_cancelled"
