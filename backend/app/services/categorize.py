"""Deterministic categorization into the fixed taxonomy (services/taxonomy.py).

The single "robust algorithm" shared by every ingest source:
- **Bank (Plaid):** map Plaid's Personal Finance Category (already merchant-derived) to our
  taxonomy — the strongest signal, so it's tried first.
- **Manual / fallback:** a keyword + merchant classifier over the item/merchant name.
- **Receipts:** the vision model picks from the taxonomy in the prompt; this service is the
  fallback if it declines. It also backfills historical bank rows in the migration.

Pure and deterministic (no I/O), so it's fully unit-testable and stable across the app.
"""

from __future__ import annotations

from app.core.taxonomy import REGULAR_CATEGORIES

OTHER = "Other"
_VALID = set(REGULAR_CATEGORIES)

# Plaid personal_finance_category PRIMARY → our category. Income/transfers/loan-payments are
# filtered out upstream as non-spending, so they aren't mapped here.
PLAID_PFC_MAP: dict[str, str] = {
    "FOOD_AND_DRINK": "Food & Drink",
    "GENERAL_MERCHANDISE": "Shopping",
    "HOME_IMPROVEMENT": "Shopping",
    "PERSONAL_CARE": "Shopping",
    "ENTERTAINMENT": "Entertainment",
    "TRANSPORTATION": "Transportation",
    "TRAVEL": "Travel",
    "MEDICAL": "Health",
    "GENERAL_SERVICES": "Services",
    "RENT_AND_UTILITIES": "Services",
    "BANK_FEES": "Services",
    "GOVERNMENT_AND_NON_PROFIT": "Other",
}

# Keyword / merchant substrings → category. First category with a hit wins, in this order,
# so more specific buckets are checked before broad ones. Lowercase; matched as substrings.
_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "Travel",
        (
            "hotel",
            "motel",
            "airbnb",
            "airline",
            "airways",
            "flight",
            "delta",
            "united air",
            "southwest",
            "expedia",
            "booking.com",
            "marriott",
            "hilton",
            "lodging",
            "resort",
        ),
    ),
    (
        "Transportation",
        (
            "uber",
            "lyft",
            "gas",
            "fuel",
            "shell",
            "chevron",
            "exxon",
            "bp ",
            "transit",
            "metro",
            "parking",
            "toll",
            "dmv",
            "auto",
            "mechanic",
            "car wash",
        ),
    ),
    (
        "Health",
        (
            "pharmacy",
            "cvs",
            "walgreens",
            "rite aid",
            "doctor",
            "clinic",
            "medical",
            "dental",
            "dentist",
            "hospital",
            "optometr",
            "gym",
            "fitness",
        ),
    ),
    (
        "Entertainment",
        (
            "netflix",
            "spotify",
            "hulu",
            "disney+",
            "hbo",
            "max ",
            "youtube",
            "cinema",
            "movie",
            "theater",
            "theatre",
            "concert",
            "ticketmaster",
            "steam",
            "playstation",
            "xbox",
            "nintendo",
            "game",
        ),
    ),
    (
        "Services",
        (
            "rent",
            "mortgage",
            "insurance",
            "electric",
            "water bill",
            "utility",
            "utilities",
            "internet",
            "comcast",
            "xfinity",
            "at&t",
            "verizon",
            "t-mobile",
            "phone bill",
            "subscription",
            "membership",
            "bank fee",
            "atm fee",
            "accountant",
            "legal",
        ),
    ),
    (
        "Food & Drink",
        (
            "restaurant",
            "cafe",
            "coffee",
            "starbucks",
            "mcdonald",
            "chipotle",
            "pizza",
            "grocery",
            "groceries",
            "supermarket",
            "kroger",
            "safeway",
            "trader joe",
            "whole foods",
            "aldi",
            "publix",
            "deli",
            "bakery",
            "brewery",
            "diner",
            "food",
            "eats",
        ),
    ),
    (
        "Shopping",
        (
            "amazon",
            "target",
            "walmart",
            "best buy",
            "apple store",
            "ikea",
            "home depot",
            "lowe",
            "store",
            "shop",
            "clothing",
            "apparel",
            "nike",
            "shoes",
            "electronics",
            "mall",
            "etsy",
            "ebay",
        ),
    ),
)


def from_plaid_pfc(primary: str | None) -> str:
    """Map a Plaid PFC primary to our taxonomy; unknown/absent → Other."""
    return PLAID_PFC_MAP.get((primary or "").strip().upper(), OTHER)


def from_text(name: str | None) -> str:
    """Classify from a merchant/item name via keyword match; no hit → Other."""
    n = (name or "").lower()
    if not n.strip():
        return OTHER
    for category, keywords in _KEYWORDS:
        if any(kw in n for kw in keywords):
            return category
    return OTHER


def categorize(*, name: str | None = None, plaid_pfc: str | None = None) -> str:
    """Best category for an item. Plaid's PFC is the strongest signal (already
    merchant-derived), so it's used when it resolves to something specific; otherwise fall
    back to the name classifier. Always returns a valid taxonomy member."""
    if plaid_pfc:
        pfc = from_plaid_pfc(plaid_pfc)
        if pfc != OTHER:
            return pfc
    result = from_text(name)
    return result if result in _VALID else OTHER
