"""Rotating quarterly bonus categories — rewards optimizer v3 (rewards-optimizer-plan §5).

Chase Freedom Flex / Discover it earn 5% in categories that CHANGE each quarter (up to a
$1,500/quarter cap), then their base rate. This module holds a hand-maintained calendar and
overlays the current quarter's 5% categories onto a rotating card's profile so the optimizer
credits them for that quarter.

⚠️ The calendar is HAND-MAINTAINED and WILL rot — issuers publish upcoming quarters on their
own schedule. Verify each quarter (or refresh via the Tavily/LLM leg, §5). Entries below are
PLACEHOLDERS pending confirmation; an unknown card/quarter simply yields no bonus — the card
falls back to its base rate and is never over-credited. Categories use the reward-category
vocabulary from ``services.rewards.REWARD_CATEGORIES``.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

from app.services.reward_kb import RewardProfile

ROTATING_RATE = 0.05
ROTATING_CAP_CENTS = 150_000  # $1,500 per quarter

# card key → {(year, quarter): active reward categories}. PLACEHOLDER data — verify.
ROTATING_CALENDAR: dict[str, dict[tuple[int, int], frozenset[str]]] = {
    "discover_it_cash": {
        (2026, 1): frozenset({"groceries", "drugstore"}),
        (2026, 2): frozenset({"gas", "transit"}),
        (2026, 3): frozenset({"gas", "online_retail"}),
        (2026, 4): frozenset({"online_retail", "wholesale_club"}),
    },
    "chase_freedom_flex": {
        (2026, 1): frozenset({"groceries", "streaming"}),
        (2026, 2): frozenset({"gas", "dining"}),
        (2026, 3): frozenset({"dining", "online_retail"}),
        (2026, 4): frozenset({"online_retail", "wholesale_club"}),
    },
}


def quarter_of(d: date) -> tuple[int, int]:
    """Calendar quarter of a local date, e.g. 2026-07-18 → (2026, 3)."""
    return (d.year, (d.month - 1) // 3 + 1)


def active_categories(card_key: str, year: int, quarter: int) -> frozenset[str]:
    """The 5% categories active for a rotating card in a given quarter (empty if unknown)."""
    return ROTATING_CALENDAR.get(card_key, {}).get((year, quarter), frozenset())


def with_rotating_bonus(profile: RewardProfile, year: int, quarter: int) -> RewardProfile:
    """Overlay the quarter's active 5% categories (cap $1,500) onto a rotating card's profile.

    Non-rotating cards, and rotating cards with no known active categories this quarter, are
    returned unchanged (so a stale/missing calendar never over-credits — falls back to base)."""
    if not profile.rotating:
        return profile
    active = active_categories(profile.key, year, quarter)
    if not active:
        return profile
    rates = {**profile.category_rates, **{c: ROTATING_RATE for c in active}}
    caps = {**profile.category_caps, **{c: ROTATING_CAP_CENTS for c in active}}
    return replace(profile, category_rates=rates, category_caps=caps)
