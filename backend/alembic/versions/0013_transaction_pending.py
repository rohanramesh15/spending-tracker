"""transactions.pending — show a bank transaction before it posts

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-29

Lets Plaid-synced transactions appear as soon as they're reported, even while still
`pending`, instead of waiting for them to post. Chart-only exclusion, same shape as
`hidden`: the row stays in the ledger but insights.spending() skips it until it posts
(a pending amount/category can still change). Default false so existing rows are
unaffected. When a pending transaction posts, Plaid's sync reports the pending id in
`removed` and the posted transaction as a fresh `added` row — the pending row is deleted
and the posted one inserted normally, no extra plumbing needed (see
docs/pending-transactions-plan.md while it's still around).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE transactions
            ADD COLUMN pending boolean NOT NULL DEFAULT false;
        """)


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS pending;")
