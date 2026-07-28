"""line_items.hidden — exclude an item from spending without removing it

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-29

Lets a line item stay visible in its transaction's item list while being excluded from
every spending total: the transaction's own subtotal/total (recomputed in
transactions._recompute_from_line_items) and the pie chart's category aggregation
(insights.spending()). Simple additive boolean, default false so existing rows are
unaffected.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE line_items
            ADD COLUMN hidden boolean NOT NULL DEFAULT false;
        """)


def downgrade() -> None:
    op.execute("ALTER TABLE line_items DROP COLUMN IF EXISTS hidden;")
