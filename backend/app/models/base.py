"""Shared column helpers for the data model.

Conventions enforced here (CLAUDE.md #1, plan §5):
- Money is integer cents in ``BIGINT`` columns — helpers below never touch floats.
- Primary keys are UUIDs (``gen_random_uuid()`` server-side).
- ``user_id`` is a UUID that references Supabase ``auth.users(id)``; it is present on
  EVERY user-data table (including child tables like ``line_items``) so each table can
  carry its own RLS policy — the global rule in plan §5 overrides the per-table field
  lists, which omit it on the children.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field


def uuid_pk() -> uuid.UUID:
    """Primary-key column: UUID, server default gen_random_uuid()."""
    return Field(
        default_factory=uuid.uuid4,
        sa_column=Column(
            PGUUID(as_uuid=True),
            primary_key=True,
            server_default=func.gen_random_uuid(),
        ),
    )


def user_id_col() -> uuid.UUID:
    """The RLS anchor: NOT NULL UUID, indexed. FK to auth.users is added in the
    migration (SQLModel can't reference the ``auth`` schema declaratively)."""
    return Field(
        sa_column=Column(PGUUID(as_uuid=True), nullable=False, index=True),
    )


def money_cents(nullable: bool = False, default: int | None = None):
    """A ``BIGINT`` money column measured in integer cents."""
    return Field(
        default=default,
        sa_column=Column(BigInteger, nullable=nullable),
    )


def created_at_col():
    return Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
        ),
    )


def _timestamp_col(nullable: bool = True):
    return Column(DateTime(timezone=True), nullable=nullable)


# Re-exported for models that need a raw nullable timestamp column.
def nullable_timestamp() -> datetime | None:
    return Field(default=None, sa_column=_timestamp_col(nullable=True))
