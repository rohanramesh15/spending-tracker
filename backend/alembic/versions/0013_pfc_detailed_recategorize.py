"""Feed Plaid's detailed PFC + confidence into categorization, and recategorize (2026-07-29).

The taxonomy itself does NOT change here (still the same 7 + Tax/Tip) — what changes is how
accurately we place a transaction into it. Two parts:

  1. Add ``transactions.pfc_confidence`` so Plaid's confidence in its own PFC guess is
     persisted alongside ``pfc_primary`` / ``pfc_detailed`` (which we already stored but never
     used for categorization).
  2. Recategorize existing **bank** line items through the new resolver, which prefers the
     detailed PFC leaf — fixing the cases the primary-only map got wrong for every row
     underneath it (a gym filed as Shopping, a salon as Shopping, car repair as Services, fuel
     vs a gas utility bill).

**User edits are preserved.** There is no provenance column on ``line_items``, so a blanket
rewrite would silently stomp manual corrections. Instead a row is rewritten only when its
current category still equals what the OLD resolver would have produced from the same inputs
— i.e. nothing has touched it since ingest. Any row that differs was set deliberately (edited
by hand, or replaced by a receipt merge) and is left alone. Receipt and manual line items are
out of scope entirely: they carry no PFC, so the new resolver would return exactly what the
old one did.

Unlike 0003/0004 this imports the live resolver rather than freezing a copy — the whole point
is that the stored data matches what runtime now produces. The OLD resolver is inlined and
frozen, since it must keep describing what ingest did *before* this change.

``downgrade()`` restores every rewritten category from ``_recat_v3_backup`` and drops the
column. Reversible.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import text as _text

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# The pre-0013 resolver, frozen: primary PFC if it mapped to anything, else keyword match.
# Used only to decide whether a row is still untouched since ingest.
def _old_categorize(vendor: str | None, pfc_primary: str | None) -> str:
    from app.services.categorize import OTHER, from_plaid_pfc, from_text

    if pfc_primary:
        mapped = from_plaid_pfc(pfc_primary)
        if mapped != OTHER:
            return mapped
    return from_text(vendor)


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Persist Plaid's confidence in its own PFC guess going forward.
    op.execute("ALTER TABLE transactions ADD COLUMN pfc_confidence text")

    # 2) Recategorize bank line items whose category is still whatever ingest assigned.
    op.execute("""
        CREATE TABLE _recat_v3_backup (
            row_id        uuid PRIMARY KEY,
            old_category  text NOT NULL
        );
        """)

    from app.services.categorize import categorize

    rows = conn.execute(
        _text("""
        SELECT li.id, li.user_id, li.raw_name, c.name AS current_category,
               t.vendor, t.pfc_primary, t.pfc_detailed
        FROM line_items li
        JOIN transactions t ON t.id = li.transaction_id
        JOIN categories c ON c.id = li.category_id
        WHERE t.source = 'plaid'
        """)
    ).fetchall()

    for row_id, user_id, raw_name, current, vendor, pfc_primary, pfc_detailed in rows:
        # Untouched-since-ingest check. The line item's own name is what ingest classified
        # on (bank rows get one synthetic line item named after the merchant); fall back to
        # the transaction vendor for the 0003-era backfilled rows.
        name = raw_name or vendor
        if current != _old_categorize(name, pfc_primary):
            continue  # edited by hand or replaced by a receipt merge — leave it alone
        # pfc_confidence is NULL for every pre-existing row (we only start capturing it
        # above), and absent confidence is treated as trustworthy by the resolver.
        new = categorize(name=name, plaid_pfc=pfc_primary, plaid_pfc_detailed=pfc_detailed)
        if new == current:
            continue
        conn.execute(
            _text("""
            INSERT INTO _recat_v3_backup (row_id, old_category) VALUES (:rid, :old)
            ON CONFLICT (row_id) DO NOTHING;
            """),
            {"rid": row_id, "old": current},
        )
        conn.execute(
            _text("""
            UPDATE line_items SET category_id = c.id
            FROM categories c
            WHERE line_items.id = :rid AND c.user_id = :uid AND c.name = :new;
            """),
            {"rid": row_id, "uid": user_id, "new": new},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        _text("""
        UPDATE line_items li SET category_id = c.id
        FROM _recat_v3_backup b
        JOIN categories c ON c.name = b.old_category
        WHERE li.id = b.row_id AND c.user_id = li.user_id;
        """)
    )
    op.execute("DROP TABLE IF EXISTS _recat_v3_backup")
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS pfc_confidence")
