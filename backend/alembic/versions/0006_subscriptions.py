"""Subscriptions table (docs/subscriptions-plan.md §4, v3 — persistence + user control).

Adds ``subscriptions``: detected recurring merchants, keyed per user on the normalized
``merchant``. Detection fields are refreshed by recompute; ``status`` (detected/confirmed/
dismissed/cancelled) is user/scan-owned. Self-contained; mirrors 0001/0005 for RLS, the
per-user policy, the ``authenticated`` grant, and the guarded ``auth.users`` FK.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CLAIM_UID = "(SELECT (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid)"

_CREATE = """
CREATE TABLE subscriptions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL,
    merchant         text NOT NULL,          -- normalized key
    display_name     text NOT NULL,
    type             text,
    amount_cents     bigint NOT NULL,
    cadence          text NOT NULL,
    status           text NOT NULL DEFAULT 'detected',
    occurrences      integer NOT NULL DEFAULT 0,
    first_charged_on date,
    last_charged_on  date,
    next_charge_on   date,
    confidence       numeric(4,3),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_subscriptions_user_merchant UNIQUE (user_id, merchant),
    CONSTRAINT ck_subscriptions_status
        CHECK (status IN ('detected', 'confirmed', 'dismissed', 'cancelled'))
);
CREATE INDEX ix_subscriptions_user ON subscriptions(user_id);
"""


def upgrade() -> None:
    op.execute(_CREATE)
    op.execute("ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;")
    op.execute(f"""
        CREATE POLICY subscriptions_user_isolation ON subscriptions
            USING (user_id = {CLAIM_UID})
            WITH CHECK (user_id = {CLAIM_UID});
        """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO authenticated;")
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('auth.users') IS NOT NULL THEN
                EXECUTE 'ALTER TABLE subscriptions
                    ADD CONSTRAINT fk_subscriptions_user
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
            END IF;
        END $$;
        """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS subscriptions CASCADE;")
