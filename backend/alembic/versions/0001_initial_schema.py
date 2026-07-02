"""initial schema: core loop tables + RLS + taxonomy seed (Phase 1)

Revision ID: 0001
Revises:
Create Date: 2026-07-01

Implements plan §5 plus the Phase 1 locks and the hardening decisions made in review:
- RLS on every user-data table, keyed on the request's JWT claims
  (``request.jwt.claims -> sub``) — the same claims the app sets per request
  (app/core/db.py). Portable, Supabase-compatible form of ``auth.uid()``.
- **Multi-tenant hardening (designed for >1 user):** idempotency is
  ``UNIQUE(user_id, source, external_id)``; child rows are tied to their parent's owner
  via composite FKs ``(user_id, parent_id) → parent(user_id, id)`` so a user can never
  attach a child to another user's row (plain FK checks bypass RLS). Nullable label refs
  (``category_id``, ``linked_account_id``) stay simple FKs — cross-user misuse there is
  benign (can't be read back under RLS) and SET NULL is incompatible with a composite FK
  on a NOT NULL ``user_id``.
- ``CHECK`` constraints pin the enum-like text columns at the DB level.
- ``line_items.position`` preserves receipt line order.
- ``transactions.linked_account_id`` (nullable) attributes a transaction to its account
  (deviation from §5's field list; needed for the Settings view in Phase 3).
- The fixed taxonomy (plan §9, adjusted in review to 23 categories) is seeded per user by
  a trigger on ``auth.users`` AND backfilled for any user that already exists.

Written as explicit SQL so the schema is fully reviewable. Idempotent guards let the same
migration run against a plain local Postgres (no ``auth`` schema) for the RLS smoke test,
and against Supabase (with ``auth.users``) in production.
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

# The fixed taxonomy (plan §9, adjusted in review) — mirrors app/core/taxonomy.py.
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
    "Transportation & Gas",
    "Housing & Rent",
    "Utilities & Bills",
    "Entertainment & Subscriptions",
    "Travel",
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
-- Each parent carries UNIQUE(user_id, id) so children can use composite,
-- owner-scoped foreign keys.
-- ---------------------------------------------------------------------------

CREATE TABLE linked_accounts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL,
    institution         text NOT NULL,
    account_type        text,
    source              text NOT NULL,
    external_account_id text,
    is_apple_card       boolean NOT NULL DEFAULT false,
    sync_mode           text NOT NULL DEFAULT 'server',
    status              text NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_linked_accounts_source CHECK (source IN ('plaid', 'manual')),
    CONSTRAINT ck_linked_accounts_sync_mode CHECK (sync_mode IN ('server', 'device')),
    CONSTRAINT ck_linked_accounts_status
        CHECK (status IN ('active', 'needs_reauth', 'disconnected'))
);

CREATE TABLE transactions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL,
    linked_account_id   uuid REFERENCES linked_accounts(id) ON DELETE SET NULL,
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
    review_status       text NOT NULL DEFAULT 'confirmed',
    created_at          timestamptz NOT NULL DEFAULT now(),
    -- Idempotency is per-user (multi-tenant safe). NULL external_id (manual/receipt)
    -- never collides because SQL treats NULLs as distinct.
    CONSTRAINT uq_transactions_user_source_external UNIQUE (user_id, source, external_id),
    CONSTRAINT uq_transactions_user_id UNIQUE (user_id, id),
    CONSTRAINT ck_transactions_source CHECK (source IN ('receipt', 'manual', 'plaid')),
    CONSTRAINT ck_transactions_review_status
        CHECK (review_status IN ('confirmed', 'needs_review'))
);

CREATE TABLE categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    is_system   boolean NOT NULL DEFAULT false,   -- true for Tax / Tip
    CONSTRAINT uq_categories_user_name UNIQUE (user_id, name),
    CONSTRAINT uq_categories_user_id UNIQUE (user_id, id)
);

CREATE TABLE line_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,               -- denormalized from transaction for RLS
    transaction_id  uuid NOT NULL,
    position        integer NOT NULL DEFAULT 0,  -- order on the receipt
    raw_name        text NOT NULL,
    normalized_name text,
    category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
    price_cents     bigint NOT NULL,             -- LINE-EXTENDED total (qty x unit)
    quantity        numeric(12,3) NOT NULL DEFAULT 1,
    unit_size       numeric(12,3),
    unit            text,
    CONSTRAINT fk_line_items_txn FOREIGN KEY (user_id, transaction_id)
        REFERENCES transactions(user_id, id) ON DELETE CASCADE
);

CREATE TABLE category_overrides (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,
    normalized_name text NOT NULL,
    category_id     uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_overrides_user_name UNIQUE (user_id, normalized_name),
    CONSTRAINT fk_overrides_category FOREIGN KEY (user_id, category_id)
        REFERENCES categories(user_id, id) ON DELETE CASCADE
);

CREATE TABLE reconciliation_reviews (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL,
    incoming_transaction_id uuid NOT NULL,
    matched_transaction_id  uuid NOT NULL,
    match_score             numeric(5,4),
    created_at              timestamptz NOT NULL DEFAULT now(),
    resolved_at             timestamptz,
    resolution              text,
    CONSTRAINT fk_recon_incoming FOREIGN KEY (user_id, incoming_transaction_id)
        REFERENCES transactions(user_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_recon_matched FOREIGN KEY (user_id, matched_transaction_id)
        REFERENCES transactions(user_id, id) ON DELETE CASCADE,
    CONSTRAINT ck_recon_resolution
        CHECK (resolution IS NULL OR resolution IN ('merge', 'skip', 'replace', 'keep_both'))
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
    CONSTRAINT uq_recurring_user_name UNIQUE (user_id, canonical_name),
    CONSTRAINT uq_recurring_user_id UNIQUE (user_id, id)
);

CREATE TABLE comparable_specs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                uuid NOT NULL,        -- denormalized for RLS
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
    user_id            uuid NOT NULL,            -- denormalized for RLS
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

-- ---------------------------------------------------------------------------
-- Indexes: user_id everywhere (RLS predicate), owner-scoped FK pairs, date filter.
-- ---------------------------------------------------------------------------
CREATE INDEX ix_linked_accounts_user       ON linked_accounts(user_id);
CREATE INDEX ix_transactions_user          ON transactions(user_id);
CREATE INDEX ix_transactions_purchased_on  ON transactions(user_id, purchased_on);
CREATE INDEX ix_transactions_review_status ON transactions(user_id, review_status);
CREATE INDEX ix_transactions_account       ON transactions(linked_account_id);
CREATE INDEX ix_line_items_txn             ON line_items(user_id, transaction_id);
CREATE INDEX ix_line_items_category        ON line_items(category_id);
CREATE INDEX ix_categories_user            ON categories(user_id);
CREATE INDEX ix_overrides_category         ON category_overrides(user_id, category_id);
CREATE INDEX ix_recon_incoming ON reconciliation_reviews(user_id, incoming_transaction_id);
CREATE INDEX ix_recon_matched  ON reconciliation_reviews(user_id, matched_transaction_id);
CREATE INDEX ix_recurring_user             ON recurring_items(user_id);
CREATE INDEX ix_comparable_recurring       ON comparable_specs(user_id, recurring_item_id);
CREATE INDEX ix_price_quotes_spec          ON price_quotes(user_id, comparable_spec_id);
"""


# RLS policy body: the row's user_id must equal the 'sub' claim on the request.
# This is exactly what Supabase's auth.uid() resolves to, written portably.
# Wrapped in a scalar subquery so Postgres evaluates it ONCE per query (InitPlan)
# rather than once per row — Supabase's documented RLS-performance rule.
CLAIM_UID = "(SELECT (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid)"

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

    # Attach the signup trigger AND backfill any user that already exists.
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('auth.users') IS NOT NULL THEN
                DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
                CREATE TRIGGER on_auth_user_created
                    AFTER INSERT ON auth.users
                    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

                -- Backfill: seed categories for users created before this migration.
                PERFORM public.seed_default_categories(id) FROM auth.users;
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
