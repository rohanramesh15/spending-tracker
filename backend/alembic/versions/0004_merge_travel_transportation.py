"""Taxonomy v3: 8 → 7 categories (2026-07-13).

Renames "Food & Drink" → "Food and Drinks" and merges "Transportation" + "Travel" into a
single "Travel/Transportation". Self-contained (does not import the live taxonomy). It:
  1. backs up every line item's + override's current category name (for reversibility),
  2. seeds the 7 new categories for every existing user (only the 2 changed names are new),
  3. remaps line_items and category_overrides old → new (per user, by name),
  4. deletes the now-unused old categories ("Food & Drink", "Transportation", "Travel"),
  5. rewrites the signup seed function to seed the 7 going forward.

No bank backfill here — 0003 already itemized historical bank rows. `downgrade()` restores
categories from the backup, re-creates the old names + seed function, and drops the two
new-only names. Reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


OLD_REGULAR = [
    "Food & Drink",
    "Shopping",
    "Entertainment",
    "Transportation",
    "Travel",
    "Health",
    "Services",
    "Other",
]
NEW_REGULAR = [
    "Food and Drinks",
    "Shopping",
    "Entertainment",
    "Travel/Transportation",
    "Health",
    "Services",
    "Other",
]
SYSTEM = ["Tax", "Tip"]

# Old category name → new category name (confirmed with the user 2026-07-13).
OLD_TO_NEW = {
    "Food & Drink": "Food and Drinks",
    "Shopping": "Shopping",
    "Entertainment": "Entertainment",
    "Transportation": "Travel/Transportation",
    "Travel": "Travel/Transportation",
    "Health": "Health",
    "Services": "Services",
    "Other": "Other",
}
# Old categories that disappear (renamed or merged away).
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
    # 1) Backup current category name per line item + per override (for reversibility).
    #    Distinct table name from 0003's _recat_backup, which it leaves in place.
    op.execute("""
        CREATE TABLE _recat_v2_backup (
            kind          text NOT NULL,   -- 'line_item' | 'override'
            row_id        uuid NOT NULL,
            old_category  text
        );
        """)
    op.execute("""
        INSERT INTO _recat_v2_backup (kind, row_id, old_category)
        SELECT 'line_item', li.id, c.name
        FROM line_items li JOIN categories c ON c.id = li.category_id;
        """)
    op.execute("""
        INSERT INTO _recat_v2_backup (kind, row_id, old_category)
        SELECT 'override', o.id, c.name
        FROM category_overrides o JOIN categories c ON c.id = o.category_id;
        """)

    # 2) Seed the 7 new categories for every existing user (only the 2 renamed/merged names
    #    are actually new; the rest already exist — ON CONFLICT keeps them).
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
            WHERE t.category_id = oc.id AND oc.id <> nc.id;
            """)

    # 4) Delete the now-unused old categories (line items/overrides already remapped;
    #    recurring_items.category_id is ON DELETE SET NULL and is recomputed from name).
    op.execute(
        f"DELETE FROM categories WHERE is_system = false AND name = ANY({_sql_array(OBSOLETE)});"
    )

    # 5) Rewrite the signup seed function to seed the 7 going forward.
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
    # Recreate the old categories (only the 3 deleted names are missing).
    op.execute(f"""
        INSERT INTO categories (user_id, name, is_system)
        SELECT u.user_id, n.name, false
        FROM (SELECT DISTINCT user_id FROM categories) u
        CROSS JOIN unnest({_sql_array(OLD_REGULAR)}) AS n(name)
        ON CONFLICT (user_id, name) DO NOTHING;
        """)
    # Restore line-item + override categories from the backup (match by user + old name).
    for table, kind in (("line_items", "line_item"), ("category_overrides", "override")):
        op.execute(f"""
            UPDATE {table} t
            SET category_id = oc.id
            FROM _recat_v2_backup b
            JOIN {table} t2 ON t2.id = b.row_id
            JOIN categories oc ON oc.user_id = t2.user_id AND oc.name = b.old_category
            WHERE b.kind = '{kind}' AND t.id = b.row_id;
            """)
    # Drop the new-only names (that didn't exist before this migration).
    new_only = [c for c in NEW_REGULAR if c not in OLD_REGULAR]
    op.execute(
        f"DELETE FROM categories WHERE is_system = false AND name = ANY({_sql_array(new_only)});"
    )
    # Restore the old seed function (the 8).
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
    op.execute("DROP TABLE IF EXISTS _recat_v2_backup;")
