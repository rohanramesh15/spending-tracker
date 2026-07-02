"""The fixed category taxonomy (plan §9).

Locked in Phase 1 and embedded in the Phase 2 extraction prompt — the LLM must pick
from this list (fallback ``Other``), never invent categories. Renames are safe later
(IDs stable); merges/splits require re-mapping historical rows, so this is the single
source of truth. The migration's seed function mirrors this list.
"""

# Regular categories the LLM assigns to line items (and used at transaction level for
# unitemized bank charges). "Other" stays last as the fallback. The grocery aisles are
# populated by scanned receipts; the life-spending buckets below cover bank-synced
# transactions so they don't all fall into "Other"/"Uncategorized".
REGULAR_CATEGORIES: tuple[str, ...] = (
    # Grocery aisles (itemized from receipts)
    "Produce",
    "Dairy",
    "Meat & Seafood",
    "Bakery",
    "Pantry",
    "Frozen",
    "Beverages",
    "Snacks",
    # Everyday / retail
    "Household",
    "Personal Care",
    "Health/Pharmacy",
    "Pet",
    "Dining Out",
    "Electronics",
    "Clothing",
    # Life-spending (mostly bank-synced)
    "Transportation & Gas",
    "Housing & Rent",
    "Utilities & Bills",
    "Entertainment & Subscriptions",
    "Travel",
    # Fallback — must stay last
    "Other",
)

# System categories, stored at transaction level and shown as their own pie slices.
SYSTEM_CATEGORIES: tuple[str, ...] = ("Tax", "Tip")

ALL_CATEGORIES: tuple[str, ...] = REGULAR_CATEGORIES + SYSTEM_CATEGORIES
