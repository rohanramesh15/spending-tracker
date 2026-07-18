"""cards table — card-level entity for the rewards optimizer (rewards-optimizer-plan §3, v1)

Revision ID: 0008
Revises: 0005
Create Date: 2026-07-18

Adds ``cards``: one row per Plaid *account* (a bank login / ``linked_accounts`` row can hold
several accounts/cards), carrying the matched reward profile. ``LinkedAccount`` is left
untouched (it stays one row per Plaid Item — rewards-optimizer-plan §0 fact #1).

Self-contained; mirrors 0001/0006 for RLS, the per-user policy, the ``authenticated`` grant,
and the guarded ``auth.users`` FK. Uses the house owner-scoped composite FK
``(user_id, linked_account_id) → linked_accounts(user_id, id)`` (adds the missing
``UNIQUE(user_id, id)`` on ``linked_accounts`` to support it), so a card can never be
attached to another user's account.

> ⚠️ COMBINE NOTE (rewards-optimizer-plan §8): this branch was built off ``0005`` in parallel
> with the subscriptions branch, which occupies revisions ``0006``/``0007``. When the two
> branches merge, re-point ``down_revision`` from ``"0005"`` to ``"0007"`` (subscriptions'
> notifications head) so the chain stays linear/single-head. Nothing else needs to change.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"  # chained after subscriptions' notifications (combined)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CLAIM_UID = "(SELECT (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid)"

_CREATE = """
-- Enable the owner-scoped composite FK from cards (linked_accounts.id is the PK, so the pair
-- is already unique; this just lets us reference it).
ALTER TABLE linked_accounts
    ADD CONSTRAINT uq_linked_accounts_user_id UNIQUE (user_id, id);

CREATE TABLE cards (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               uuid NOT NULL,
    linked_account_id     uuid NOT NULL,
    plaid_account_id      text,          -- Plaid per-account id (nullable until captured)
    name                  text,          -- Plaid account name ("Blue Cash Everyday")
    official_name         text,
    mask                  text,          -- last 4
    subtype               text,          -- 'credit card' | 'checking' | …
    reward_profile_key    text,          -- matched/confirmed seed key; NULL until resolved
    reward_profile_source text,          -- 'matched' | 'user' | 'llm' | 'tavily'
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_cards_account UNIQUE (user_id, linked_account_id, plaid_account_id),
    CONSTRAINT fk_cards_linked_account FOREIGN KEY (user_id, linked_account_id)
        REFERENCES linked_accounts(user_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_cards_reward_profile_source
        CHECK (reward_profile_source IS NULL
               OR reward_profile_source IN ('matched', 'user', 'llm', 'tavily'))
);
CREATE INDEX ix_cards_user ON cards(user_id);
"""


def upgrade() -> None:
    op.execute(_CREATE)
    op.execute("ALTER TABLE cards ENABLE ROW LEVEL SECURITY;")
    op.execute(f"""
        CREATE POLICY cards_user_isolation ON cards
            USING (user_id = {CLAIM_UID})
            WITH CHECK (user_id = {CLAIM_UID});
        """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON cards TO authenticated;")
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('auth.users') IS NOT NULL THEN
                EXECUTE 'ALTER TABLE cards
                    ADD CONSTRAINT fk_cards_user
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
            END IF;
        END $$;
        """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cards CASCADE;")
    op.execute("ALTER TABLE linked_accounts DROP CONSTRAINT IF EXISTS uq_linked_accounts_user_id;")
