"""Recurring-item detection (plan §6.8, CLAUDE.md #10).

Keys on the **canonical name** — the LLM's ``normalized_name`` ("milk, 2%": lowercase,
generic noun first), which is stable across vendors/brands so "buys 2% milk weekly" is
caught even when the brand rotates. An item is *recurring* when it was bought on
``min_occurrences`` (default 3) or more distinct shopping trips within a window.

Detection is computed on the fly from confirmed line items (no materialization / no
background job at single-user scale — always fresh). The pure aggregation here is
unit-tested; the endpoint supplies rows from the DB.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

_WS = re.compile(r"\s+")


def canonical_key(raw_name: str, normalized_name: str | None) -> str:
    """The grouping key: the LLM's normalized name when present, else a light
    normalization of the raw name (lowercase, collapsed whitespace)."""
    base = normalized_name if (normalized_name and normalized_name.strip()) else raw_name
    return _WS.sub(" ", base.strip().lower())


@dataclass(frozen=True)
class LineRow:
    canonical: str
    category_id: str | None
    purchased_on: date
    transaction_id: str
    price_cents: int
    quantity: Decimal


@dataclass
class RecurringAgg:
    canonical_name: str
    category_id: str | None
    occurrences: int  # distinct transactions (shopping trips)
    avg_unit_price_cents: int
    first_seen: date
    last_seen: date
    price_history: list[tuple[date, int]]  # (date, avg unit price that day), oldest first


def _unit_price_cents(price_cents: int, quantity: Decimal) -> int:
    """Per-unit price in integer cents (plan §6.8: price_cents / quantity)."""
    qty = quantity if quantity and quantity > 0 else Decimal(1)
    return int((Decimal(price_cents) / qty).to_integral_value())


def detect_recurring(rows: list[LineRow], *, min_occurrences: int = 3) -> list[RecurringAgg]:
    """Aggregate line items into recurring items, most-frequent first."""
    groups: dict[str, list[LineRow]] = defaultdict(list)
    for r in rows:
        groups[r.canonical].append(r)

    result: list[RecurringAgg] = []
    for canonical, items in groups.items():
        trips = {i.transaction_id for i in items}
        if len(trips) < min_occurrences:
            continue

        # Average unit price per distinct day → a clean price-over-time series.
        by_day: dict[date, list[int]] = defaultdict(list)
        for i in items:
            by_day[i.purchased_on].append(_unit_price_cents(i.price_cents, i.quantity))
        history = [
            (day, round(sum(prices) / len(prices)))
            for day, prices in sorted(by_day.items())
        ]
        avg_unit = round(sum(p for _, p in history) / len(history))

        result.append(
            RecurringAgg(
                canonical_name=canonical,
                category_id=_dominant_category(items),
                occurrences=len(trips),
                avg_unit_price_cents=avg_unit,
                first_seen=min(i.purchased_on for i in items),
                last_seen=max(i.purchased_on for i in items),
                price_history=history,
            )
        )

    result.sort(key=lambda a: (a.occurrences, a.last_seen), reverse=True)
    return result


def _dominant_category(items: list[LineRow]) -> str | None:
    """The most common category_id among the item's occurrences (ties → most recent)."""
    counts: dict[str, int] = defaultdict(int)
    for i in items:
        if i.category_id:
            counts[i.category_id] += 1
    if not counts:
        return None
    return max(counts, key=lambda c: counts[c])
