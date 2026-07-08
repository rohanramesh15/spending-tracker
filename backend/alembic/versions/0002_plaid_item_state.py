"""Phase 3: Plaid Item state on linked_accounts.

Adds the per-Item fields bank sync needs: the access token, Plaid's item_id, the
``/transactions/sync`` cursor, and a last-synced timestamp.

**Storage deviation (recorded in plan §6.7):** the access token lives on this row
(RLS-protected, disk-encrypted) rather than in SSM. Plaid access tokens are created
dynamically per user/Item, which doesn't fit the boot-time SSM hydration used for static
secrets and can't work in local dev. The token sits alongside the transaction data it
unlocks (comparably sensitive, same DB, same RLS).

The new columns are covered by the existing ``linked_accounts`` RLS policy (from 0001).

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE linked_accounts
            ADD COLUMN access_token        text,
            ADD COLUMN item_id             text,
            ADD COLUMN transactions_cursor text,
            ADD COLUMN last_synced_at      timestamptz;

        -- One Plaid Item per user: the upsert target when linking / re-linking a bank.
        CREATE UNIQUE INDEX uq_linked_accounts_user_item
            ON linked_accounts (user_id, item_id) WHERE item_id IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS uq_linked_accounts_user_item;
        ALTER TABLE linked_accounts
            DROP COLUMN IF EXISTS access_token,
            DROP COLUMN IF EXISTS item_id,
            DROP COLUMN IF EXISTS transactions_cursor,
            DROP COLUMN IF EXISTS last_synced_at;
    """)
