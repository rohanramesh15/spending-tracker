"""Semantic reconciliation matcher (plan §6.3, CLAUDE.md #4/#5).

Matches a new transaction against existing ones on *semantics only* — normalized
vendor + purchase date within a small window + total within a cent (integer math on
cents) — never on source. Conservative by design (plan §10): a near-miss produces no
match so you aren't nagged about false duplicates; a real duplicate surfaces the
attended merge/skip/replace/keep-both dialog.

The pure decision (``is_semantic_match`` / ``normalize_vendor``) is DB-free and
unit-tested; ``find_match`` is the thin DB wrapper the ingest door calls.

Scope note (Phase 2): the matcher keys on vendor + date + total, which cleanly catches
the attended duplicates that exist now (scanning the same receipt twice, or scanning a
receipt for a purchase already entered by hand). The plan also mentions *item overlap*
as a secondary signal; that only matters once Plaid brings in unitemized card
transactions to overlap against, so it lands with the needs-review queue in Phase 3.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal

from sqlmodel import Session, select

from app.models.enums import ReviewStatus
from app.models.tables import Transaction

# ±2 days (plan §6.3: "date within ±1–2 days"). Wide enough that a card posts a day or
# two after the receipt date; narrow enough not to collide with a later same-store trip.
DATE_WINDOW_DAYS = 2
# "within a cent" == abs(a - b) <= 1 (CLAUDE.md #1).
CENT_TOLERANCE = 1

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_vendor(vendor: str) -> str:
    """Collapse a vendor string to a comparable form.

    Lowercase, drop punctuation, and remove standalone numeric tokens (store numbers
    like ``#456``) so ``"KROGER #456"`` and a hand-typed ``"Kroger"`` compare equal,
    while keeping enough of the name to stay conservative.
    """
    tokens = _NON_ALNUM.sub(" ", vendor.casefold()).split()
    tokens = [t for t in tokens if not t.isdigit()]
    return " ".join(tokens)


def is_semantic_match(
    *,
    vendor_a: str,
    date_a: date,
    total_a_cents: int,
    vendor_b: str,
    date_b: date,
    total_b_cents: int,
) -> bool:
    """True iff two transactions look like the same purchase from different entry paths.

    All three must hold: same normalized vendor, purchase dates within the window, and
    totals within a cent. Source is deliberately never consulted.
    """
    if normalize_vendor(vendor_a) != normalize_vendor(vendor_b):
        return False
    if abs((date_a - date_b).days) > DATE_WINDOW_DAYS:
        return False
    return abs(total_a_cents - total_b_cents) <= CENT_TOLERANCE


def find_match(
    db: Session,
    user_id: str,
    *,
    vendor: str,
    purchased_on: date,
    total_cents: int,
    exclude_id: str | None = None,
) -> Transaction | None:
    """Return the best existing confirmed transaction that semantically matches, or None.

    Only ``confirmed`` transactions are considered — a still-pending ``needs_review`` row
    isn't a settled duplicate to reconcile against. RLS is the net; we still filter on
    ``user_id`` explicitly (CLAUDE.md #3).
    """
    lo = purchased_on - timedelta(days=DATE_WINDOW_DAYS)
    hi = purchased_on + timedelta(days=DATE_WINDOW_DAYS)

    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.review_status == ReviewStatus.confirmed,
        Transaction.purchased_on >= lo,
        Transaction.purchased_on <= hi,
    )
    if exclude_id is not None:
        stmt = stmt.where(Transaction.id != exclude_id)

    target_vendor = normalize_vendor(vendor)
    candidates = [
        t
        for t in db.exec(stmt).all()
        if normalize_vendor(t.vendor) == target_vendor
        and abs(t.total_cents - total_cents) <= CENT_TOLERANCE
    ]
    if not candidates:
        return None

    # Best match first: closest date, then closest total, then most recently created.
    candidates.sort(
        key=lambda t: (
            abs((t.purchased_on - purchased_on).days),
            abs(t.total_cents - total_cents),
            -(t.created_at.timestamp()),
        )
    )
    return candidates[0]


def match_score(date_a: date, total_a_cents: int, date_b: date, total_b_cents: int) -> Decimal:
    """A 0–1 confidence for a matched pair, for the ``reconciliation_reviews`` row.

    1.0 = same day and identical total; small linear penalties within the (already
    conservative) match window. Both inputs are assumed to have passed ``find_match``,
    so the score stays high — it just orders the queue by how sure we are.
    """
    cents_off = min(abs(total_a_cents - total_b_cents), CENT_TOLERANCE)
    day_penalty = Decimal(abs((date_a - date_b).days)) * Decimal("0.05")
    cent_penalty = Decimal(cents_off) * Decimal("0.02")
    return max(Decimal("0"), Decimal("1") - day_penalty - cent_penalty)


def match_reason(
    *,
    vendor_a: str,
    date_a: date,
    total_a_cents: int,
    vendor_b: str,
    date_b: date,
    total_b_cents: int,
) -> str:
    """Human phrase for the review card, e.g. 'same vendor, 1 day apart, same total'."""
    same_vendor = normalize_vendor(vendor_a) == normalize_vendor(vendor_b)
    vendor = "same vendor" if same_vendor else "similar vendor"
    days = abs((date_a - date_b).days)
    when = "same day" if days == 0 else f"{days} day{'s' if days != 1 else ''} apart"
    total = "same total" if total_a_cents == total_b_cents else "total within a cent"
    return f"{vendor}, {when}, {total}"
