"""Recurring-item detection tests — pure, no DB (plan §6.8, CLAUDE.md #10)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.services.recurring import LineRow, canonical_key, detect_recurring


def _row(canon, txn, day, *, price=100, qty=1, cat="cat-dairy") -> LineRow:
    return LineRow(
        canonical=canon,
        category_id=cat,
        purchased_on=date(2026, 6, day),
        transaction_id=txn,
        price_cents=price,
        quantity=Decimal(qty),
    )


def test_canonical_key_prefers_normalized_name_else_raw() -> None:
    assert canonical_key("GV MILK 2% GAL", "milk, 2%") == "milk, 2%"
    assert canonical_key("  Whole   Milk ", None) == "whole milk"
    assert canonical_key("Eggs", "  ") == "eggs"  # blank normalized falls back to raw


def test_flags_items_bought_on_three_or_more_trips() -> None:
    rows = [
        _row("milk, 2%", "t1", 1),
        _row("milk, 2%", "t2", 8),
        _row("milk, 2%", "t3", 15),
        _row("bread", "t1", 1),
        _row("bread", "t2", 8),  # only 2 trips → not recurring
    ]
    result = detect_recurring(rows)
    assert [r.canonical_name for r in result] == ["milk, 2%"]
    assert result[0].occurrences == 3


def test_multiple_of_same_item_in_one_trip_is_one_occurrence() -> None:
    rows = [
        _row("milk, 2%", "t1", 1),
        _row("milk, 2%", "t1", 1),  # same trip
        _row("milk, 2%", "t2", 8),
    ]
    assert detect_recurring(rows) == []  # only 2 distinct trips
    rows.append(_row("milk, 2%", "t3", 15))
    assert detect_recurring(rows)[0].occurrences == 3


def test_avg_unit_price_uses_quantity_and_builds_history() -> None:
    rows = [
        _row("milk", "t1", 1, price=400, qty=1),
        _row("milk", "t2", 8, price=900, qty=2),  # 450/unit
        _row("milk", "t3", 15, price=500, qty=1),
    ]
    r = detect_recurring(rows)[0]
    assert [p for _, p in r.price_history] == [400, 450, 500]
    assert r.avg_unit_price_cents == 450
    assert r.first_seen == date(2026, 6, 1)
    assert r.last_seen == date(2026, 6, 15)


def test_sorted_by_occurrences_descending() -> None:
    rows = [_row("milk", f"m{i}", i + 1) for i in range(4)]
    rows += [_row("eggs", f"e{i}", i + 1) for i in range(3)]
    assert [r.canonical_name for r in detect_recurring(rows)] == ["milk", "eggs"]
