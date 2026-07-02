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


class StoreType(StrEnum):
    physical = "physical"
    online = "online"


class SubstitutionTightness(StrEnum):
    strict = "strict"
    medium = "medium"
    loose = "loose"
