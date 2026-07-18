"""Rewards optimizer — pure, deterministic, no I/O (rewards-optimizer-plan §2.1/§2.3).

Two pure pieces:
- ``reward_category(vendor, pfc_detailed)`` — map a transaction to a **reward-specific**
  category (finer than our 7-category taxonomy: groceries vs dining vs gas vs travel vs
  transit …). v1 keyword-matches the vendor; v2 prefers Plaid's detailed PFC when present.
- ``optimize(...)`` — for each category the user spends in, pick the highest-earning card
  among the cards they hold, applying ANNUAL category **caps** so the advice isn't
  overstated (rewards-optimizer-plan §8). Returns per-category recommendations.

v1 shows *advice* (best card per category + what it would earn); the "you lost $X vs the
card you actually used" figure needs per-transaction card attribution and lands in v2 — the
``current_*``/``missed`` fields stay ``None`` until then.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.reward_kb import RewardProfile

REWARD_CATEGORIES: tuple[str, ...] = (
    "groceries",
    "dining",
    "gas",
    "travel",
    "transit",
    "streaming",
    "drugstore",
    "online_retail",
    "wholesale_club",
    "other",
)
OTHER = "other"

# Plaid detailed PFC → reward category (v2, when pfc_detailed is persisted). Only the
# unambiguous mappings; anything else falls through to the vendor keyword classifier.
_PFC_DETAILED_MAP: dict[str, str] = {
    "FOOD_AND_DRINK_GROCERIES": "groceries",
    "FOOD_AND_DRINK_RESTAURANT": "dining",
    "FOOD_AND_DRINK_FAST_FOOD": "dining",
    "FOOD_AND_DRINK_COFFEE": "dining",
    "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR": "dining",
    "TRANSPORTATION_GAS": "gas",
    "TRANSPORTATION_PUBLIC_TRANSIT": "transit",
    "TRANSPORTATION_TAXIS_AND_RIDE_SHARES": "transit",
    "TRANSPORTATION_PARKING": "transit",
    "TRANSPORTATION_TOLLS": "transit",
    "TRANSPORTATION_BIKES_AND_SCOOTERS": "transit",
    "TRAVEL_FLIGHTS": "travel",
    "TRAVEL_LODGING": "travel",
    "TRAVEL_RENTAL_CARS_AND_TAXIS": "travel",
    "TRAVEL_RENTAL_CARS": "travel",
    "MEDICAL_PHARMACIES_AND_SUPPLEMENTS": "drugstore",
    "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES": "online_retail",
    "ENTERTAINMENT_TV_AND_MOVIES": "streaming",
    "ENTERTAINMENT_MUSIC_AND_AUDIO": "streaming",
}

# Vendor keyword lists per reward category. Checked IN THIS ORDER — specific buckets before
# broad ones, and collisions resolved deliberately (e.g. "uber eats" is dining, checked
# before "uber" is transit; wholesale clubs before groceries). Split out of
# services.categorize._KEYWORDS, which lumps groceries+dining and gas+travel together.
_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "wholesale_club",
        ("costco", "sam's club", "sams club", "bj's wholesale", "bjs wholesale", "wholesale club"),
    ),
    (
        "streaming",
        (
            "netflix",
            "spotify",
            "hulu",
            "disney+",
            "disneyplus",
            "disney plus",
            "hbo",
            "hbomax",
            "hbo max",
            "max.com",
            "paramount+",
            "peacock",
            "apple tv",
            "apple music",
            "prime video",
            "youtube premium",
            "youtube tv",
            "pandora",
            "tidal",
            "audible",
            "sirius",
            "siriusxm",
            "crunchyroll",
        ),
    ),
    (
        "drugstore",
        ("cvs", "walgreens", "rite aid", "duane reade", "pharmacy", "drugstore"),
    ),
    (
        "dining",
        (
            "restaurant",
            "diner",
            "eatery",
            "bistro",
            "grill",
            "steakhouse",
            "buffet",
            "cafe",
            "café",
            "coffee",
            "espresso",
            "bakery",
            "deli",
            "pizzeria",
            "pizza",
            "sushi",
            "ramen",
            "taqueria",
            "taco",
            "burrito",
            "bbq",
            "barbecue",
            "bar & grill",
            "sports bar",
            "wine bar",
            "pub",
            "tavern",
            "brewery",
            "grubhub",
            "doordash",
            "uber eats",
            "ubereats",
            "seamless",
            "postmates",
            "caviar",
            "mcdonald",
            "burger king",
            "wendy",
            "kfc",
            "taco bell",
            "chipotle",
            "popeyes",
            "chick-fil-a",
            "chick fil a",
            "panera",
            "dunkin",
            "five guys",
            "shake shack",
            "in-n-out",
            "domino",
            "papa john",
            "panda express",
            "olive garden",
            "starbucks",
            "peet's",
            "dutch bros",
            "qdoba",
            "jimmy john",
            "jersey mike",
            "sweetgreen",
            "cava",
        ),
    ),
    (
        "groceries",
        (
            "grocery",
            "groceries",
            "supermarket",
            "farmers market",
            "bodega",
            "butcher",
            "kroger",
            "safeway",
            "trader joe",
            "whole foods",
            "aldi",
            "publix",
            "wegmans",
            "h-e-b",
            "heb",
            "ralphs",
            "vons",
            "albertsons",
            "stop & shop",
            "food lion",
            "harris teeter",
            "sprouts",
            "fresh market",
            "meijer",
            "winco",
            "food4less",
            "smart & final",
            "99 ranch",
            "hmart",
            "h mart",
            "giant eagle",
            "shoprite",
            "instacart",
        ),
    ),
    (
        "gas",
        (
            "gas station",
            "gasoline",
            "fuel",
            "shell",
            "chevron",
            "exxon",
            "mobil",
            "texaco",
            "citgo",
            "sunoco",
            "valero",
            "arco",
            "speedway",
            "wawa",
            "quiktrip",
            "sheetz",
            "marathon",
            "bp ",
            "76 gas",
            "phillips 66",
            "circle k",
        ),
    ),
    (
        "transit",
        (
            "uber",
            "lyft",
            "taxi",
            "cab",
            "rideshare",
            "ride share",
            "transit",
            "metro",
            "subway station",
            "light rail",
            "commuter rail",
            "bus fare",
            "mta",
            "omny",
            "metrocard",
            "e-zpass",
            "ezpass",
            "fastrak",
            "clipper card",
            "septa",
            "bart",
            "caltrain",
            "amtrak",
            "ferry",
            "parking",
            "parking garage",
            "parking meter",
            "toll",
            "tolls",
            "tollway",
            "turnpike",
            "citibike",
            "bike share",
            "scooter",
        ),
    ),
    (
        "travel",
        (
            "airline",
            "airlines",
            "airways",
            "flight",
            "flights",
            "airfare",
            "delta air",
            "united airlines",
            "american airlines",
            "southwest airlines",
            "jetblue",
            "alaska airlines",
            "spirit airlines",
            "frontier airlines",
            "airport",
            "hotel",
            "motel",
            "inn",
            "hostel",
            "lodging",
            "resort",
            "airbnb",
            "vrbo",
            "marriott",
            "hilton",
            "hyatt",
            "holiday inn",
            "best western",
            "sheraton",
            "westin",
            "hampton inn",
            "wyndham",
            "car rental",
            "rental car",
            "hertz",
            "avis",
            "enterprise rent",
            "national car",
            "alamo rent",
            "sixt",
            "turo",
            "expedia",
            "booking.com",
            "priceline",
            "kayak",
            "orbitz",
            "travelocity",
            "cruise",
        ),
    ),
    (
        "online_retail",
        ("amazon", "ebay", "etsy", "aliexpress", "shein", "temu", "wayfair", "chewy"),
    ),
)


def _compile(keywords: tuple[str, ...]) -> re.Pattern[str]:
    # Bounded-token match (mirrors services.categorize._compile): a keyword matches only when
    # not glued to other letters/digits, so "gas" hits "shell gas" but not "las vegas".
    alt = "|".join(re.escape(k) for k in keywords)
    return re.compile(r"(?<![a-z0-9])(?:" + alt + r")(?![a-z0-9])")


_MATCHERS: tuple[tuple[str, re.Pattern[str]], ...] = tuple((c, _compile(k)) for c, k in _KEYWORDS)


def reward_category(vendor: str, plaid_pfc_detailed: str | None = None) -> str:
    """Map a transaction to a reward category.

    Prefer Plaid's detailed PFC when it resolves to a known category (v2 — far more reliable
    than a vendor string); otherwise keyword-match the vendor (v1). Unknown → ``"other"``.
    """
    if plaid_pfc_detailed:
        mapped = _PFC_DETAILED_MAP.get(plaid_pfc_detailed.strip().upper())
        if mapped:
            return mapped
    name = (vendor or "").lower()
    if name.strip():
        for category, matcher in _MATCHERS:
            if matcher.search(name):
                return category
    return OTHER


@dataclass
class CategoryReco:
    reward_category: str
    spend_cents: int  # observed spend in this category over the window
    annualized_spend_cents: int  # spend_cents scaled to a year (for the earn estimate)
    best_card_key: str
    best_card_name: str
    best_rate: float  # EFFECTIVE cashback rate on the best card at this spend level (post-cap)
    est_annual_reward_cents: int  # what the best card would earn on this category per year
    # v2 (actual-usage) fields — None until per-transaction card attribution exists:
    current_card_key: str | None = None
    current_card_name: str | None = None
    current_rate: float | None = None
    est_annual_missed_cents: int | None = None


def _annual_reward_cents(profile: RewardProfile, category: str, annual_spend_cents: int) -> int:
    """Cashback-equivalent annual earn for a category, applying the annual cap: spend up to
    the cap earns the bonus rate, spend beyond it reverts to the card's base rate. Rotating
    5% categories are NOT credited here (they live in category_caps-free base until v3)."""
    rate = profile.category_rates.get(category, profile.base_rate)
    cap = profile.category_caps.get(category)
    if cap is not None and annual_spend_cents > cap:
        bonus_units = cap * rate + (annual_spend_cents - cap) * profile.base_rate
    else:
        bonus_units = annual_spend_cents * rate
    return round(bonus_units * profile.points_value_cents)


@dataclass
class ActualUsage:
    """Actual-vs-optimal for one category over the spend we can attribute to a known card
    (rewards v2). ``missed_annual_cents`` compares the best held card against the cards
    actually used, on the SAME attributed spend."""

    dominant_card_key: str | None  # the card that carried the most attributed spend here
    dominant_card_name: str | None
    dominant_rate: float | None  # its effective rate for this category
    missed_annual_cents: int


def missed_rewards_for_category(
    category: str,
    attributed_spend_by_card: dict[str, int],
    card_profiles: dict[str, RewardProfile],
    wallet: list[RewardProfile],
    window_days: int,
) -> ActualUsage:
    """Compute the reward left on the table in one category, over ONLY the spend attributable
    to a card with a known profile (so it's an apples-to-apples optimal-vs-actual comparison;
    debit/unmatched spend earns nothing and is excluded rather than counted as missed).

    ``attributed_spend_by_card``: card_id → spend (cents, in the window) on cards that have a
    profile. Actual earn is cap-aware per card's annualized share; optimal is the best wallet
    card on the total annualized attributed spend. Dominant = the card with the most spend."""
    total = sum(attributed_spend_by_card.values())
    if total <= 0 or not wallet or window_days <= 0:
        return ActualUsage(None, None, None, 0)

    annual_total = round(total * 365 / window_days)
    actual = 0
    dom_id: str | None = None
    dom_spend = -1
    for card_id, spend in attributed_spend_by_card.items():
        profile = card_profiles.get(card_id)
        if profile is None:
            continue
        actual += _annual_reward_cents(profile, category, round(spend * 365 / window_days))
        if spend > dom_spend:
            dom_spend, dom_id = spend, card_id
    optimal = max(_annual_reward_cents(p, category, annual_total) for p in wallet)
    dom = card_profiles.get(dom_id) if dom_id else None
    return ActualUsage(
        dominant_card_key=dom.key if dom else None,
        dominant_card_name=dom.display_name if dom else None,
        dominant_rate=round(dom.effective_rate(category), 4) if dom else None,
        missed_annual_cents=max(0, optimal - actual),
    )


def optimize(
    spend_by_category: dict[str, int],
    user_profiles: list[RewardProfile],
    window_days: int,
    actual_usage: dict[str, ActualUsage] | None = None,
) -> list[CategoryReco]:
    """Best card per reward category among the cards the user holds.

    For each category with spend, annualize the spend, compute each held card's cap-aware
    annual earn, and pick the highest. ``"other"`` is skipped (no actionable per-category
    advice for uncategorized spend). Returns recommendations sorted by annualized spend desc
    (biggest-impact categories first). Empty if the user holds no cards or has no spend.

    When ``actual_usage`` is supplied (v2), each reco is annotated with the card actually used
    and ``est_annual_missed_cents`` = best-card earn − what they actually earned (clamped ≥0).
    """
    if not user_profiles or window_days <= 0:
        return []

    recos: list[CategoryReco] = []
    for category, spend_cents in spend_by_category.items():
        if category == OTHER or spend_cents <= 0:
            continue
        annualized = round(spend_cents * 365 / window_days)
        best: RewardProfile | None = None
        best_reward = -1
        for profile in user_profiles:
            reward = _annual_reward_cents(profile, category, annualized)
            if reward > best_reward:
                best, best_reward = profile, reward
        if best is None:
            continue
        effective_rate = (
            (best_reward / annualized) if annualized > 0 else best.base_effective_rate()
        )
        reco = CategoryReco(
            reward_category=category,
            spend_cents=spend_cents,
            annualized_spend_cents=annualized,
            best_card_key=best.key,
            best_card_name=best.display_name,
            best_rate=round(effective_rate, 4),
            est_annual_reward_cents=best_reward,
        )
        au = actual_usage.get(category) if actual_usage else None
        if au is not None:
            reco.current_card_key = au.dominant_card_key
            reco.current_card_name = au.dominant_card_name
            reco.current_rate = au.dominant_rate
            reco.est_annual_missed_cents = au.missed_annual_cents
        recos.append(reco)
    recos.sort(key=lambda r: r.annualized_spend_cents, reverse=True)
    return recos
