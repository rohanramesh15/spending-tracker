"""Notifications table (docs/subscriptions-plan.md §5, v4 — proactive monitoring).

Adds ``notifications``: in-app subscription alerts emitted by the daily scan. ``dedup_key``
(unique per user) makes the scan idempotent; ``read_at`` is the read state. Self-contained;
mirrors 0001/0006 for RLS, the per-user policy, the ``authenticated`` grant, and the guarded
``auth.users`` FK. Also carries a single-column FK to ``subscriptions(id)`` so an alert is
cleaned up when its subscription is deleted.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CLAIM_UID = "(SELECT (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid)"

_CREATE = """
CREATE TABLE notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,
    kind            text NOT NULL,
    subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
    title           text NOT NULL,
    body            text,
    dedup_key       text NOT NULL,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_notifications_user_dedup UNIQUE (user_id, dedup_key),
    CONSTRAINT ck_notifications_kind
        CHECK (kind IN ('new', 'price_increased', 'upcoming', 'likely_cancelled'))
);
CREATE INDEX ix_notifications_user ON notifications(user_id);
"""


def upgrade() -> None:
    op.execute(_CREATE)
    op.execute("ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;")
    op.execute(f"""
        CREATE POLICY notifications_user_isolation ON notifications
            USING (user_id = {CLAIM_UID})
            WITH CHECK (user_id = {CLAIM_UID});
        """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;")
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('auth.users') IS NOT NULL THEN
                EXECUTE 'ALTER TABLE notifications
                    ADD CONSTRAINT fk_notifications_user
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
            END IF;
        END $$;
        """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notifications CASCADE;")
