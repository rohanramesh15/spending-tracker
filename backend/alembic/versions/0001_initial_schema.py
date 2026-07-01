"""initial schema: core loop tables + RLS + taxonomy seed (Phase 1)

Revision ID: 0001
Revises:
Create Date: 2026-07-01

Implements plan §5 exactly, plus the two things Phase 1 locks in:
- Row-Level Security on every user-data table, keyed on the request's JWT claims
  (``request.jwt.claims -> sub``) — the same claims the app sets per request
  (app/core/db.py). This is the portable, Supabase-compatible form of ``auth.uid()``.
- The fixed category taxonomy (plan §9), seeded per user by a trigger on ``auth.users``.

Written as explicit SQL so the schema is fully reviewable. Idempotent guards let the
same migration run against a plain local Postgres (no ``auth`` schema) for the RLS
smoke test, and against Supabase (with ``auth.users``) in production.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Every user-data table (plan §5 global rule: all carry user_id + an RLS policy).
USER_TABLES: tuple[str, ...] = (
    "linked_accounts",
    "transactions",
    "line_items",
    "categories",
    "category_overrides",
    "reconciliation_reviews",
    "recurring_items",
    "comparable_specs",
    "price_quotes",
)

# The fixed taxonomy (plan §9) — mirrors app/core/taxonomy.py.
REGULAR_CATEGORIES = [
    "Produce",
    "Dairy",
    "Meat & Seafood",
    "Bakery",
    "Pantry",
    "Frozen",
    "Beverages",
    "Snacks",
    "Household",
    "Personal Care",
    "Health/Pharmacy",
    "Pet",
    "Dining Out",
    "Electronics",
    "Clothing",
    "Other",
]
SYSTEM_CATEGORIES = ["Tax", "Tip"]


def _sql_array(values: list[str]) -> str:
    escaped = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
    return "ARRAY[" + escaped + "]"


DDL = """
-- gen_random_uuid() is core in PG13+; ensure pgcrypto too for older setups.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The Supabase 'authenticated' role already exists in prod; create a stand-in
-- locally so grants and RLS role-switching work in the smoke test.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables (plan §5). Money is *_cents BIGINT; purchased_on is a local DATE.
-- ---------------------------------------------------------------------------

CREATE TABLE linked_accounts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL,
    institution         text NOT NULL,
    account_type        text,
    source              text NOT NULL,          -- plaid | manual
    external_account_id text,
    is_apple_card       boolean NOT NULL DEFAULT false,
    sync_mode           text NOT NULL DEFAULT 'server',   -- server | device
    status              text NOT NULL DEFAULT 'active',   -- active | needs_reauth | disconnected
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL,
    vendor              text NOT NULL,
    purchased_on        date NOT NULL,          -- local calendar date, never UTC
    purchased_time      time,
    source              text NOT NULL,          -- receipt | manual | plaid
    external_id         text,
    subtotal_cents      bigint,
    tax_cents           bigint NOT NULL DEFAULT 0,
    tip_cents           bigint NOT NULL DEFAULT 0,
    total_cents         bigint NOT NULL,
    currency            varchar(3) NOT NULL DEFAULT 'USD',
    receipt_image_path  text,                   -- transient; nulled after confirm
    raw_extraction_json jsonb,                  -- permanent record of extraction
    review_status       text NOT NULL DEFAULT 'confirmed',  -- confirmed | needs_review
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_transactions_source_external_id UNIQUE (source, external_id)
);

CREATE TABLE categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    is_system   boolean NOT NULL DEFAULT false,   -- true for Tax / Tip
    CONSTRAINT uq_categories_user_name UNIQUE (user_id, name)
);

CREATE TABLE line_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,               -- denormalized from transaction for RLS
    transaction_id  uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    raw_name        text NOT NULL,
    normalized_name text,
    category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
    price_cents     bigint NOT NULL,
    quantity        numeric(12,3) NOT NULL DEFAULT 1,
    unit_size       numeric(12,3),
    unit            text
);

CREATE TABLE category_overrides (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,
    normalized_name text NOT NULL,
    category_id     uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_overrides_user_name UNIQUE (user_id, normalized_name)
);

CREATE TABLE reconciliation_reviews (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL,
    incoming_transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    matched_transaction_id  uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    match_score             numeric(5,4),
    created_at              timestamptz NOT NULL DEFAULT now(),
    resolved_at             timestamptz,
    resolution              text                 -- merge | skip | replace | keep_both
);

CREATE TABLE recurring_items (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL,
    canonical_name       text NOT NULL,
    category_id          uuid REFERENCES categories(id) ON DELETE SET NULL,
    occurrences          integer NOT NULL DEFAULT 0,
    first_seen           date,
    last_seen            date,
    avg_unit_price_cents bigint,
    CONSTRAINT uq_recurring_user_name UNIQUE (user_id, canonical_name)
);

CREATE TABLE comparable_specs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                uuid NOT NULL,        -- denormalized for RLS
    recurring_item_id      uuid NOT NULL REFERENCES recurring_items(id) ON DELETE CASCADE,
    category               text,
    attributes_json        jsonb,
    size_value             numeric(12,3),
    size_unit              text,
    substitution_tightness text NOT NULL DEFAULT 'strict'   -- strict | medium | loose
);

CREATE TABLE price_quotes (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,            -- denormalized for RLS
    comparable_spec_id uuid NOT NULL REFERENCES comparable_specs(id) ON DELETE CASCADE,
    store_name         text NOT NULL,
    store_type         text NOT NULL DEFAULT 'physical',  -- physical | online
    location_id        text,
    product_title      text,
    price_cents        bigint NOT NULL,
    unit_price_cents   bigint,
    unit               text,
    distance_mi        numeric(6,2),
    source_api         text,
    fetched_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes (user_id everywhere for RLS predicate; hot FKs and date filter).
-- ---------------------------------------------------------------------------
CREATE INDEX ix_linked_accounts_user            ON linked_accounts(user_id);
CREATE INDEX ix_transactions_user               ON transactions(user_id);
CREATE INDEX ix_transactions_purchased_on       ON transactions(user_id, purchased_on);
CREATE INDEX ix_transactions_review_status      ON transactions(user_id, review_status);
CREATE INDEX ix_line_items_user                 ON line_items(user_id);
CREATE INDEX ix_line_items_transaction          ON line_items(transaction_id);
CREATE INDEX ix_line_items_category             ON line_items(category_id);
CREATE INDEX ix_categories_user                 ON categories(user_id);
CREATE INDEX ix_category_overrides_user         ON category_overrides(user_id);
CREATE INDEX ix_recon_user                       ON reconciliation_reviews(user_id);
CREATE INDEX ix_recon_incoming                   ON reconciliation_reviews(incoming_transaction_id);
CREATE INDEX ix_recon_matched                    ON reconciliation_reviews(matched_transaction_id);
CREATE INDEX ix_recurring_user                   ON recurring_items(user_id);
CREATE INDEX ix_comparable_specs_user            ON comparable_specs(user_id);
CREATE INDEX ix_comparable_specs_recurring       ON comparable_specs(recurring_item_id);
CREATE INDEX ix_price_quotes_user                ON price_quotes(user_id);
CREATE INDEX ix_price_quotes_spec                ON price_quotes(comparable_spec_id);
"""


# RLS policy body: the row's user_id must equal the 'sub' claim on the request.
# This is exactly what Supabase's auth.uid() resolves to, written portably.
CLAIM_UID = "(current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid"

SEED_FUNCTIONS = f"""
-- Seed the fixed taxonomy for one user. SECURITY DEFINER so it can insert past RLS.
CREATE OR REPLACE FUNCTION public.seed_default_categories(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.categories (user_id, name, is_system)
    SELECT uid, name, false FROM unnest({_sql_array(REGULAR_CATEGORIES)}) AS name
    ON CONFLICT (user_id, name) DO NOTHING;

    INSERT INTO public.categories (user_id, name, is_system)
    SELECT uid, name, true FROM unnest({_sql_array(SYSTEM_CATEGORIES)}) AS name
    ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- Trigger body: seed a new auth user's taxonomy on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.seed_default_categories(NEW.id);
    RETURN NEW;
END;
$$;
"""


def upgrade() -> None:
    op.execute(DDL)

    # Enable RLS, add the per-request-claims policy, and grant CRUD to authenticated.
    for table in USER_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"""
            CREATE POLICY {table}_user_isolation ON {table}
                USING (user_id = {CLAIM_UID})
                WITH CHECK (user_id = {CLAIM_UID});
            """)
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO authenticated;")

    # FK user_id -> auth.users(id) only where the auth schema exists (Supabase/prod).
    for table in USER_TABLES:
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

    op.execute(SEED_FUNCTIONS)

    # Attach the signup trigger only if auth.users exists.
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('auth.users') IS NOT NULL THEN
                DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
                CREATE TRIGGER on_auth_user_created
                    AFTER INSERT ON auth.users
                    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
            END IF;
        END $$;
        """)


def downgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('auth.users') IS NOT NULL THEN
                DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
            END IF;
        END $$;
        """)
    op.execute("DROP FUNCTION IF EXISTS public.handle_new_user();")
    op.execute("DROP FUNCTION IF EXISTS public.seed_default_categories(uuid);")

    # Drop tables in FK-dependency order (policies drop with their tables).
    for table in (
        "price_quotes",
        "comparable_specs",
        "recurring_items",
        "reconciliation_reviews",
        "category_overrides",
        "line_items",
        "transactions",
        "categories",
        "linked_accounts",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
