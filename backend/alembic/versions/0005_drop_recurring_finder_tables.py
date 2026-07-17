"""Drop the recurring-items + cheaper-store-finder tables (2026-07-17).

The recurring-item detection (Phase 4) and cheaper-store finder (Phase 5) were removed;
this drops their now-unused tables: ``price_quotes``, ``comparable_specs``,
``recurring_items`` (in FK-dependency order). Self-contained. ``downgrade()`` recreates the
tables + indexes + RLS exactly as migration 0001 did (empty — the data was derived), so the
migration is reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("price_quotes", "comparable_specs", "recurring_items")  # child → parent order
CLAIM_UID = "(SELECT (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid)"

_RECREATE_DDL = """
CREATE TABLE recurring_items (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL,
    canonical_name       text NOT NULL,
    category_id          uuid REFERENCES categories(id) ON DELETE SET NULL,
    occurrences          integer NOT NULL DEFAULT 0,
    first_seen           date,
    last_seen            date,
    avg_unit_price_cents bigint,
    CONSTRAINT uq_recurring_user_name UNIQUE (user_id, canonical_name),
    CONSTRAINT uq_recurring_user_id UNIQUE (user_id, id)
);

CREATE TABLE comparable_specs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                uuid NOT NULL,
    recurring_item_id      uuid NOT NULL,
    category               text,
    attributes_json        jsonb,
    size_value             numeric(12,3),
    size_unit              text,
    substitution_tightness text NOT NULL DEFAULT 'strict',
    CONSTRAINT uq_comparable_specs_user_id UNIQUE (user_id, id),
    CONSTRAINT fk_comparable_recurring FOREIGN KEY (user_id, recurring_item_id)
        REFERENCES recurring_items(user_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_comparable_tightness
        CHECK (substitution_tightness IN ('strict', 'medium', 'loose'))
);

CREATE TABLE price_quotes (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,
    comparable_spec_id uuid NOT NULL,
    store_name         text NOT NULL,
    store_type         text NOT NULL DEFAULT 'physical',
    location_id        text,
    product_title      text,
    price_cents        bigint NOT NULL,
    unit_price_cents   bigint,
    unit               text,
    distance_mi        numeric(6,2),
    source_api         text,
    fetched_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_quotes_spec FOREIGN KEY (user_id, comparable_spec_id)
        REFERENCES comparable_specs(user_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_price_quotes_store_type CHECK (store_type IN ('physical', 'online'))
);

CREATE INDEX ix_recurring_user        ON recurring_items(user_id);
CREATE INDEX ix_comparable_recurring  ON comparable_specs(user_id, recurring_item_id);
CREATE INDEX ix_price_quotes_spec     ON price_quotes(user_id, comparable_spec_id);
"""


def upgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")


def downgrade() -> None:
    op.execute(_RECREATE_DDL)
    # RLS + grants, matching 0001's per-user-isolation pattern (parent → child order).
    for table in ("recurring_items", "comparable_specs", "price_quotes"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"""
            CREATE POLICY {table}_user_isolation ON {table}
                USING (user_id = {CLAIM_UID})
                WITH CHECK (user_id = {CLAIM_UID});
            """)
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO authenticated;")
        op.execute(f"""
            DO $$
            BEGIN
                IF to_regclass('auth.users') IS NOT NULL THEN
                    EXECUTE 'ALTER TABLE {table}
                        ADD CONSTRAINT fk_{table}_user
                        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
                END IF;
            END $$;
            """)
