"""The fixed category taxonomy (plan §9).

Reworked (2026-07-08) from the original 21 grocery-aisle buckets to 8 broad, life-spending
categories aligned with how bank/card issuers categorize (Apple Card's model). The LLM must
pick a category from this list (fallback ``Other``), never invent one; the same list backs
the deterministic ``categorize()`` service (services/categorize.py) for bank + manual items.
This is the single source of truth — the migration's seed function mirrors it.
"""

# Regular categories assigned to line items (receipts) and to bank/manual transactions.
# "Other" stays LAST as the fallback.
REGULAR_CATEGORIES: tuple[str, ...] = (
    "Food & Drink",
    "Shopping",
    "Entertainment",
    "Transportation",
    "Travel",
    "Health",
    "Services",
    "Other",
)

# Short descriptions embedded in the extraction prompt to steer the model (kept terse).
CATEGORY_DESCRIPTIONS: dict[str, str] = {
    "Food & Drink": "restaurants, cafes, groceries, bars",
    "Shopping": "retail and general merchandise, clothing, electronics, household goods",
    "Entertainment": "streaming, games, events, movies, media",
    "Transportation": "gas, rideshare, transit, parking, auto",
    "Travel": "flights, hotels, lodging, and similar",
    "Health": "pharmacies, medical, dental, wellness",
    "Services": "subscriptions, utilities, rent/bills, professional services",
    "Other": "anything that doesn't clearly fit the above",
}

# System categories, stored at transaction level and shown as their own pie slices.
SYSTEM_CATEGORIES: tuple[str, ...] = ("Tax", "Tip")

ALL_CATEGORIES: tuple[str, ...] = REGULAR_CATEGORIES + SYSTEM_CATEGORIES
