"""transactions.hidden — exclude a whole purchase from spending charts

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-29

Lets a transaction stay visible in the ledger while being excluded from pie-chart
aggregation (insights.spending()). Mirrors line_items.hidden but at purchase level:
stored totals are unchanged (the row still shows its amount); only charting skips it.
Default false so existing rows are unaffected.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE transactions
            ADD COLUMN hidden boolean NOT NULL DEFAULT false;
        """)


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS hidden;")
