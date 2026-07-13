"""Apple Card CSV parser tests — pure, no DB, no network (plan §11, user-flow §9)."""

from __future__ import annotations

from datetime import date

import pytest

from app.services.apple_card_csv import parse_apple_card_csv

_SAMPLE = (
    "Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)\n"
    "07/01/2026,07/02/2026,APPLE.COM/BILL,Apple,Other,Purchase,9.99\n"
    '07/02/2026,07/03/2026,WHOLEFDS,Whole Foods Market,Grocery,Purchase,"1,254.20"\n'
    "07/03/2026,07/04/2026,PAYMENT THANK YOU,Apple Card,Payment,Payment,-100.00\n"
    "07/04/2026,07/05/2026,REFUND,Some Store,Shopping,Purchase,-12.00\n"
)


def test_parses_purchases_and_skips_payments_and_credits() -> None:
    rows, skipped = parse_apple_card_csv(_SAMPLE.encode())
    assert [(r.vendor, r.total_cents, r.purchased_on) for r in rows] == [
        ("Apple", 999, date(2026, 7, 1)),
        ("Whole Foods Market", 125420, date(2026, 7, 2)),  # comma + decimal handled
    ]
    assert skipped == 2  # the payment and the negative "purchase" (refund)


def test_external_id_is_stable_and_row_specific() -> None:
    rows_a, _ = parse_apple_card_csv(_SAMPLE.encode())
    rows_b, _ = parse_apple_card_csv(_SAMPLE.encode())
    ids_a = [r.external_id for r in rows_a]
    assert ids_a == [r.external_id for r in rows_b]  # deterministic → idempotent import
    assert len(set(ids_a)) == len(ids_a)  # distinct rows → distinct ids
    assert all(i.startswith("applecsv:") for i in ids_a)


def test_tolerates_bom_and_alternate_headers() -> None:
    # A BOM, different date format, and "Amount" instead of "Amount (USD)".
    csv = "﻿Date,Description,Type,Amount\n" "2026-07-05,Trader Joe's,Purchase,42.00\n"
    rows, skipped = parse_apple_card_csv(csv.encode())
    assert skipped == 0
    assert rows[0].vendor == "Trader Joe's"  # falls back to Description when no Merchant col
    assert rows[0].total_cents == 4200
    assert rows[0].purchased_on == date(2026, 7, 5)


def test_rejects_non_apple_card_csv() -> None:
    with pytest.raises(ValueError):
        parse_apple_card_csv(b"foo,bar,baz\n1,2,3\n")
