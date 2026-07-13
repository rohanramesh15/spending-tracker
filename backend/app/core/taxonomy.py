"""The fixed category taxonomy (plan §9).

Reworked twice:
- 2026-07-08: from 21 grocery-aisle buckets to 8 broad life-spending categories.
- 2026-07-13: to 7 — "Food & Drink" renamed "Food and Drinks", and "Transportation" +
  "Travel" merged into "Travel/Transportation". Colors are assigned per category in the
  frontend (SpendingPie), so a category always shows the same hue.

This is the single source of truth. The LLM must pick a category from this list (fallback
``Other``), never invent one; the same list backs the deterministic ``categorize()``
service (services/categorize.py) for bank + manual items, and its Gemini fallback. The
migration's seed function mirrors it.
"""

# Regular categories assigned to line items (receipts) and to bank/manual transactions.
# "Other" stays LAST as the fallback.
REGULAR_CATEGORIES: tuple[str, ...] = (
    "Food and Drinks",
    "Shopping",
    "Entertainment",
    "Travel/Transportation",
    "Health",
    "Services",
    "Other",
)

# Short descriptions embedded in the extraction/classification prompts to steer the model.
CATEGORY_DESCRIPTIONS: dict[str, str] = {
    "Food and Drinks": "restaurants, cafes, bars, groceries, food delivery",
    "Shopping": "retail and general merchandise, clothing, electronics, household goods",
    "Entertainment": "streaming, games, events, movies, media, hobbies",
    "Travel/Transportation": (
        "gas, rideshare, transit, parking, tolls, auto, flights, hotels, lodging"
    ),
    "Health": "pharmacies, medical, dental, vision, fitness, wellness",
    "Services": "subscriptions, utilities, rent/bills, phone/internet, professional services",
    "Other": "anything that doesn't clearly fit the above",
}

# System categories, stored at transaction level and shown as their own pie slices.
SYSTEM_CATEGORIES: tuple[str, ...] = ("Tax", "Tip")

ALL_CATEGORIES: tuple[str, ...] = REGULAR_CATEGORIES + SYSTEM_CATEGORIES
