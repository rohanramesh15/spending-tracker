"""Recategorize: replace the 21-bucket taxonomy with 8 broad categories (2026-07-08).

Self-contained (like 0001 — does not import the live taxonomy, which has changed). It:
  1. backs up every line item's + override's current category name (for reversibility),
  2. seeds the 8 new categories for every existing user,
  3. remaps line_items and category_overrides from old → new categories,
  4. backfills existing unitemized bank transactions with one categorized line item
     (so historical bank spending stops charting as "Uncategorized"),
  5. deletes the now-unused old categories,
  6. rewrites the signup seed function to seed the 8 going forward.

`downgrade()` restores line-item/override categories from the backup, re-creates the old
categories + seed function, and removes the synthetic bank line items. Reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


OLD_REGULAR = [
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
NEW_REGULAR = [
    "Food & Drink",
    "Shopping",
    "Entertainment",
    "Transportation",
    "Travel",
    "Health",
    "Services",
    "Other",
]
SYSTEM = ["Tax", "Tip"]

# Old category name → new category name (confirmed with the user 2026-07-08).
OLD_TO_NEW = {
    "Produce": "Food & Drink",
    "Dairy": "Food & Drink",
    "Meat & Seafood": "Food & Drink",
    "Bakery": "Food & Drink",
    "Pantry": "Food & Drink",
    "Frozen": "Food & Drink",
    "Beverages": "Food & Drink",
    "Snacks": "Food & Drink",
    "Dining Out": "Food & Drink",
    "Household": "Shopping",
    "Personal Care": "Shopping",
    "Pet": "Shopping",
    "Electronics": "Shopping",
    "Clothing": "Shopping",
    "Health/Pharmacy": "Health",
    "Transportation & Gas": "Transportation",
    "Housing & Rent": "Services",
    "Utilities & Bills": "Services",
    "Entertainment & Subscriptions": "Entertainment",
    "Travel": "Travel",
    "Other": "Other",
}
# Old categories that disappear (everything old except the two names that survive verbatim).
OBSOLETE = [c for c in OLD_REGULAR if c not in NEW_REGULAR]


def _sql_array(values: list[str]) -> str:
    inner = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
    return f"ARRAY[{inner}]::text[]"


def _values_map(mapping: dict[str, str]) -> str:
    return ", ".join(
        "('" + o.replace("'", "''") + "', '" + n.replace("'", "''") + "')"
        for o, n in mapping.items()
    )


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Backup table: current category name per line item + per override, plus a flag for
    #    synthetic bank rows we create in step 4 (so downgrade can delete exactly those).
    op.execute("""
        CREATE TABLE _recat_backup (
            kind          text NOT NULL,          -- 'line_item' | 'override' | 'synthetic'
            row_id        uuid NOT NULL,
            old_category  text
        );
        """)
    op.execute("""
        INSERT INTO _recat_backup (kind, row_id, old_category)
        SELECT 'line_item', li.id, c.name
        FROM line_items li JOIN categories c ON c.id = li.category_id;
        """)
    op.execute("""
        INSERT INTO _recat_backup (kind, row_id, old_category)
        SELECT 'override', o.id, c.name
        FROM category_overrides o JOIN categories c ON c.id = o.category_id;
        """)

    # 2) Seed the 8 new categories for every existing user (idempotent).
    op.execute(f"""
        INSERT INTO categories (user_id, name, is_system)
        SELECT u.user_id, n.name, false
        FROM (SELECT DISTINCT user_id FROM categories) u
        CROSS JOIN unnest({_sql_array(NEW_REGULAR)}) AS n(name)
        ON CONFLICT (user_id, name) DO NOTHING;
        """)

    # 3) Remap line_items + category_overrides old → new (per user, by name).
    for table in ("line_items", "category_overrides"):
        op.execute(f"""
            UPDATE {table} t
            SET category_id = nc.id
            FROM categories oc
            JOIN (VALUES {_values_map(OLD_TO_NEW)}) AS m(old_name, new_name)
              ON oc.name = m.old_name
            JOIN categories nc ON nc.user_id = oc.user_id AND nc.name = m.new_name
            WHERE t.category_id = oc.id;
            """)

    # 4) Backfill existing unitemized bank transactions with one categorized line item.
    from app.services.categorize import from_text  # pure fn; migration runs once

    bank_txns = conn.execute(_text("""
            SELECT t.id, t.user_id, t.vendor, t.total_cents
            FROM transactions t
            WHERE t.source = 'plaid'
              AND NOT EXISTS (SELECT 1 FROM line_items li WHERE li.transaction_id = t.id)
            """)).fetchall()
    for txn_id, user_id, vendor, total_cents in bank_txns:
        cat_name = from_text(vendor)
        cat_id = conn.execute(
            _text("SELECT id FROM categories WHERE user_id = :u AND name = :n"),
            {"u": user_id, "n": cat_name},
        ).scalar()
        new_li_id = conn.execute(
            _text("""
                INSERT INTO line_items
                    (id, user_id, transaction_id, position, raw_name, category_id,
                     price_cents, quantity)
                VALUES (gen_random_uuid(), :u, :t, 0, :name, :cat, :price, 1)
                RETURNING id
                """),
            {"u": user_id, "t": txn_id, "name": vendor, "cat": cat_id, "price": total_cents},
        ).scalar()
        conn.execute(
            _text(
                "INSERT INTO _recat_backup (kind, row_id, old_category) "
                "VALUES ('synthetic', :id, NULL)"
            ),
            {"id": new_li_id},
        )

    # 5) Delete the now-unused old categories (line items/overrides already remapped;
    #    recurring_items.category_id is ON DELETE SET NULL).
    op.execute(
        f"DELETE FROM categories WHERE is_system = false AND name = ANY({_sql_array(OBSOLETE)});"
    )

    # 6) Rewrite the signup seed function to seed the 8 going forward.
    op.execute(f"""
        CREATE OR REPLACE FUNCTION public.seed_default_categories(uid uuid)
        RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        BEGIN
            INSERT INTO public.categories (user_id, name, is_system)
            SELECT uid, name, false FROM unnest({_sql_array(NEW_REGULAR)}) AS name
            ON CONFLICT (user_id, name) DO NOTHING;
            INSERT INTO public.categories (user_id, name, is_system)
            SELECT uid, name, true FROM unnest({_sql_array(SYSTEM)}) AS name
            ON CONFLICT (user_id, name) DO NOTHING;
        END;
        $$;
        """)


def downgrade() -> None:
    # Recreate the old categories for every user.
    op.execute(f"""
        INSERT INTO categories (user_id, name, is_system)
        SELECT u.user_id, n.name, false
        FROM (SELECT DISTINCT user_id FROM categories) u
        CROSS JOIN unnest({_sql_array(OLD_REGULAR)}) AS n(name)
        ON CONFLICT (user_id, name) DO NOTHING;
        """)
    # Delete the synthetic bank line items we created.
    op.execute(
        "DELETE FROM line_items WHERE id IN "
        "(SELECT row_id FROM _recat_backup WHERE kind = 'synthetic');"
    )
    # Restore line-item + override categories from the backup (match by user + old name).
    for table, kind in (("line_items", "line_item"), ("category_overrides", "override")):
        op.execute(f"""
            UPDATE {table} t
            SET category_id = oc.id
            FROM _recat_backup b
            JOIN {table} t2 ON t2.id = b.row_id
            JOIN categories oc ON oc.user_id = t2.user_id AND oc.name = b.old_category
            WHERE b.kind = '{kind}' AND t.id = b.row_id;
            """)
    # Drop the new-only categories (that didn't exist before).
    new_only = [c for c in NEW_REGULAR if c not in OLD_REGULAR]
    op.execute(
        f"DELETE FROM categories WHERE is_system = false AND name = ANY({_sql_array(new_only)});"
    )
    # Restore the old seed function.
    op.execute(f"""
        CREATE OR REPLACE FUNCTION public.seed_default_categories(uid uuid)
        RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        BEGIN
            INSERT INTO public.categories (user_id, name, is_system)
            SELECT uid, name, false FROM unnest({_sql_array(OLD_REGULAR)}) AS name
            ON CONFLICT (user_id, name) DO NOTHING;
            INSERT INTO public.categories (user_id, name, is_system)
            SELECT uid, name, true FROM unnest({_sql_array(SYSTEM)}) AS name
            ON CONFLICT (user_id, name) DO NOTHING;
        END;
        $$;
        """)
    op.execute("DROP TABLE IF EXISTS _recat_backup;")


def _text(sql: str):
    from sqlalchemy import text

    return text(sql)
