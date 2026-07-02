"""Reconciliation matcher tests — pure decision logic, no DB, no network (plan §6.3).

These guard the conservative match rule: same normalized vendor + date within the
window + total within a cent. False positives (nagging you about non-duplicates) and
false negatives (silently letting a duplicate through) are both bugs here.
"""

from __future__ import annotations

from datetime import date

from app.services.reconcile import (
    CENT_TOLERANCE,
    DATE_WINDOW_DAYS,
    is_semantic_match,
    normalize_vendor,
)


def test_normalize_vendor_ignores_case_punctuation_and_store_number() -> None:
    # The invariant that matters: the printed receipt form and the hand-typed form of the
    # same store collapse to the same key (store number and punctuation don't matter).
    assert normalize_vendor("KROGER #456") == normalize_vendor("Kroger")
    assert normalize_vendor("TRADER JOE'S #123") == normalize_vendor("Trader Joe's")
    assert normalize_vendor("  Whole  Foods  ") == "whole foods"


def test_normalize_vendor_keeps_distinct_names_distinct() -> None:
    assert normalize_vendor("Kroger") != normalize_vendor("Safeway")


def _match(**kw) -> bool:
    base = dict(
        vendor_a="Kroger",
        date_a=date(2026, 7, 2),
        total_a_cents=1248,
        vendor_b="KROGER #456",
        date_b=date(2026, 7, 2),
        total_b_cents=1248,
    )
    base.update(kw)
    return is_semantic_match(**base)


def test_exact_same_purchase_matches_across_vendor_formatting() -> None:
    assert _match() is True


def test_total_within_a_cent_still_matches() -> None:
    assert _match(total_b_cents=1248 + CENT_TOLERANCE) is True


def test_total_off_by_more_than_a_cent_does_not_match() -> None:
    assert _match(total_b_cents=1248 + CENT_TOLERANCE + 1) is False


def test_date_within_window_matches_but_outside_does_not() -> None:
    # A card can post a day or two after the receipt date.
    assert _match(date_b=date(2026, 7, 2 + DATE_WINDOW_DAYS)) is True
    assert _match(date_b=date(2026, 7, 2 + DATE_WINDOW_DAYS + 1)) is False


def test_different_vendor_never_matches_even_with_same_date_and_total() -> None:
    # Guards against coincidental same-total collisions across stores.
    assert _match(vendor_b="Safeway") is False
