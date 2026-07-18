"""transactions.card_id + persisted PFC — rewards optimizer v2 (rewards-optimizer-plan §4)

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-18

Attributes each purchase to the card it was made on (``card_id`` → ``cards``) and persists
Plaid's Personal Finance Category (``pfc_primary``/``pfc_detailed``) for accurate reward-
category mapping. This is what turns v1's advice into the real "you left $X on the table"
figure. ``card_id`` is a plain nullable FK (SET NULL, like ``linked_account_id``) — RLS is
the net; receipts/manual rows simply have no card.

> ⚠️ COMBINE NOTE (rewards-optimizer-plan §8): sits on top of ``0008`` (cards). ``0008``
> chains off ``0005`` in parallel with subscriptions' ``0006``/``0007``; at merge, re-point
> ``0008``'s down_revision to ``0007`` and this migration follows unchanged (…0007→0008→0009).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE transactions
            ADD COLUMN card_id      uuid REFERENCES cards(id) ON DELETE SET NULL,
            ADD COLUMN pfc_primary  text,
            ADD COLUMN pfc_detailed text;
        CREATE INDEX ix_transactions_card ON transactions(card_id);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_transactions_card;")
    op.execute(
        "ALTER TABLE transactions "
        "DROP COLUMN IF EXISTS card_id, "
        "DROP COLUMN IF EXISTS pfc_primary, "
        "DROP COLUMN IF EXISTS pfc_detailed;"
    )
