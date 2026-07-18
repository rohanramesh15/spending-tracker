"""reward_profiles cache — rewards optimizer v3 rate refresh (rewards-optimizer-plan §5)

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-18

A cache of reward rates for cards OUTSIDE the curated seed, fetched via Tavily+LLM for
multi-user coverage of the long tail. This is **global reference data** (universal card
rates), NOT user data — so it deliberately has NO RLS policy; it's world-readable by
``authenticated`` and written only by the background refresh job (service role /
``admin_session``). ``source`` + ``fetched_at`` let the UI mark it "unverified" and let the
job re-fetch stale rows.

> ⚠️ COMBINE NOTE (rewards-optimizer-plan §8): chains off 0009 → 0008 → (0005, re-pointed to
> subscriptions' 0007 at merge). Nothing else to change.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE reward_profiles (
            key                text PRIMARY KEY,
            display_name       text NOT NULL,
            issuer             text,
            base_rate          numeric(5,4) NOT NULL DEFAULT 0.01,
            category_rates     jsonb NOT NULL DEFAULT '{}'::jsonb,
            category_caps      jsonb NOT NULL DEFAULT '{}'::jsonb,
            points_value_cents numeric(5,3) NOT NULL DEFAULT 1.0,
            source             text NOT NULL DEFAULT 'tavily',
            fetched_at         timestamptz NOT NULL DEFAULT now()
        );
        -- Global reference data (not user-scoped): readable by all authenticated users, no RLS.
        GRANT SELECT ON reward_profiles TO authenticated;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reward_profiles CASCADE;")
