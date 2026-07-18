"""Card-reward knowledge base (rewards-optimizer-plan §2.2). Pure data + lookup, no I/O.

A curated seed of popular US credit cards and their reward rules, plus ``match_profile``
which maps a Plaid account name (e.g. "Blue Cash Everyday") to a seed profile.

**Accuracy note (rewards-optimizer-plan §0/§8).** This drives financial advice, so the
rates must be right. Every profile below carries a ``source`` and ``verified`` flag; the
comprehensive long-tail entries are marked ``verified=False`` and MUST get a rate-accuracy
pass before their numbers are trusted in the UI. The user's own wallet (Freedom Unlimited,
Blue Cash Everyday, BofA Travel Rewards, Discover it) is curated first and marked verified.

**Points vs cashback (§8).** ``category_rates``/``base_rate`` are the earn multiplier
expressed as a fraction assuming **1¢ per point** (so Amex Gold 4x groceries = ``0.04``).
``points_value_cents`` scales that to a real cashback-equivalent — a transferable-points
card can be worth 1.5–2¢/pt, which can flip "best card". The optimizer multiplies the two;
the UI must surface the assumption. Keep it 1.0 unless a card's points are clearly worth
more via a documented, conservative redemption.

**Caps (§8).** ``category_caps`` is the ANNUAL spend cap (integer cents) beyond which a
bonus category reverts to ``base_rate`` — e.g. Blue Cash Everyday's 3% groceries only
applies to the first $6k/yr. The top categories are exactly the capped ones, so the
optimizer MUST apply these or it overstates the advice.

**Rotating cards (§5, v3).** ``rotating=True`` cards (Freedom Flex, Discover it) have a 5%
category that changes each quarter. Until v3 models the quarterly calendar, treat them as
their ``base_rate`` + any non-rotating ``category_rates`` only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# The reward-specific category set (finer than our 7-category taxonomy). Kept in sync with
# ``services.rewards.REWARD_CATEGORIES`` — that module is the source of truth for the names.
# Imported lazily in tests; duplicated as strings here to keep this module dependency-free.

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class RewardProfile:
    key: str  # stable id, e.g. "amex_gold"
    display_name: str  # "American Express Gold"
    issuer: str  # "American Express"
    base_rate: float  # catch-all earn as a fraction @1¢/pt (0.01 = 1x/1%)
    category_rates: dict[str, float] = field(default_factory=dict)
    # ANNUAL cap (cents) per category; over the cap the rate drops to base_rate.
    category_caps: dict[str, int] = field(default_factory=dict)
    points_value_cents: float = 1.0  # cents per point/mile; 1.0 = cashback-equivalent
    rotating: bool = False  # 5%-rotating-category card (Freedom Flex / Discover it) — v3
    annual_fee_cents: int = 0  # informational only; irrelevant when ranking cards you HOLD
    # Substrings matched against the normalized Plaid account name (lowercased, alnum-only).
    # Order-independent; the most specific profile that matches wins (see match_profile).
    match_aliases: tuple[str, ...] = ()
    source: str = "seed"  # "seed" (hand-curated) | "user" | "llm" | "tavily"
    verified: bool = False  # rates confirmed against the issuer's current terms
    notes: str | None = None

    def effective_rate(self, reward_category: str) -> float:
        """Cashback-equivalent rate for a category (ignores caps — the optimizer applies
        those against actual spend). Rotating bonus is NOT included here (v3)."""
        raw = self.category_rates.get(reward_category, self.base_rate)
        return raw * self.points_value_cents

    def base_effective_rate(self) -> float:
        return self.base_rate * self.points_value_cents


# Reward-category name constants (mirror services.rewards.REWARD_CATEGORIES).
GROCERIES = "groceries"
DINING = "dining"
GAS = "gas"
TRAVEL = "travel"
TRANSIT = "transit"
STREAMING = "streaming"
DRUGSTORE = "drugstore"
ONLINE_RETAIL = "online_retail"
WHOLESALE_CLUB = "wholesale_club"

_6K = 600_000  # $6,000/yr, the common Amex Blue-Cash cap
_25K = 2_500_000  # $25,000/yr, Amex Gold groceries cap

# --- The user's wallet (curated + verified first — these must be exactly right) ----------
_USER_CARDS: list[RewardProfile] = [
    RewardProfile(
        key="chase_freedom_unlimited",
        display_name="Chase Freedom Unlimited",
        issuer="Chase",
        base_rate=0.015,
        category_rates={DINING: 0.03, DRUGSTORE: 0.03, TRAVEL: 0.05},
        points_value_cents=1.0,  # earns Ultimate Rewards; 1¢ as cashback (more if pooled w/ CSP)
        match_aliases=("freedom unlimited",),
        source="user",
        verified=True,
        notes="1.5% base; 3% dining & drugstores; 5% travel ONLY via Chase Travel portal "
        "(so the 'travel' rate overstates general travel — refine in v3).",
    ),
    RewardProfile(
        key="amex_blue_cash_everyday",
        display_name="Amex Blue Cash Everyday",
        issuer="American Express",
        base_rate=0.01,
        category_rates={GROCERIES: 0.03, ONLINE_RETAIL: 0.03, GAS: 0.03},
        category_caps={GROCERIES: _6K, ONLINE_RETAIL: _6K, GAS: _6K},
        match_aliases=("blue cash everyday", "blue cash every day"),
        source="user",
        verified=True,
        notes="3% US supermarkets / US online retail / US gas, each capped at $6k/yr then 1%. "
        "No annual fee.",
    ),
    RewardProfile(
        key="bofa_travel_rewards",
        display_name="Bank of America Travel Rewards",
        issuer="Bank of America",
        base_rate=0.015,  # 1.5 pts/$ @ ~1¢ toward travel
        match_aliases=("travel rewards", "bankamericard travel"),
        source="user",
        verified=True,
        notes="1.5x points on everything, redeemable for travel at 1¢. Preferred Rewards "
        "status can boost 25–75% (up to ~2.6%) — not modeled; confirm the user's tier.",
    ),
    RewardProfile(
        key="discover_it_cash",
        display_name="Discover it Cash Back",
        issuer="Discover",
        base_rate=0.01,
        rotating=True,
        match_aliases=("discover it", "discover cashback", "discover card"),
        source="user",
        verified=True,
        notes="5% rotating quarterly categories (Cashback Calendar), capped $1,500/qtr, then "
        "1%. Cashback Match doubles year-1. Rotating bonus modeled in v3.",
    ),
]

# --- Comprehensive popular-US-card seed (long tail — UNVERIFIED, rates need a check) ------
# Rates below are approximate/typical and DELIBERATELY marked verified=False. They exist so a
# multi-user's card is likely recognized; the numbers get a rate-accuracy pass (§8) before the
# UI trusts them.  Kept intentionally compact; extend over time.
_POPULAR_CARDS: list[RewardProfile] = [
    RewardProfile(
        key="chase_sapphire_preferred",
        display_name="Chase Sapphire Preferred",
        issuer="Chase",
        base_rate=0.01,
        category_rates={DINING: 0.03, STREAMING: 0.03, TRAVEL: 0.02},
        points_value_cents=1.25,  # UR ~1.25¢ via portal; more via transfer partners
        annual_fee_cents=9_500,
        match_aliases=("sapphire preferred",),
        notes="3x dining/streaming/online groceries, 5x Chase Travel, 2x other travel.",
    ),
    RewardProfile(
        key="chase_sapphire_reserve",
        display_name="Chase Sapphire Reserve",
        issuer="Chase",
        base_rate=0.01,
        category_rates={DINING: 0.03, TRAVEL: 0.03},
        points_value_cents=1.5,
        annual_fee_cents=55_000,
        match_aliases=("sapphire reserve",),
        notes="3x dining & travel (higher via Chase Travel).",
    ),
    RewardProfile(
        key="chase_freedom_flex",
        display_name="Chase Freedom Flex",
        issuer="Chase",
        base_rate=0.01,
        category_rates={DINING: 0.03, DRUGSTORE: 0.03, TRAVEL: 0.05},
        rotating=True,
        match_aliases=("freedom flex",),
        notes="5% rotating quarterly ($1,500/qtr cap), 3% dining & drugstores, 5% Chase Travel.",
    ),
    RewardProfile(
        key="amex_gold",
        display_name="American Express Gold",
        issuer="American Express",
        base_rate=0.01,
        category_rates={DINING: 0.04, GROCERIES: 0.04, TRAVEL: 0.03},
        category_caps={GROCERIES: _25K},
        annual_fee_cents=32_500,
        match_aliases=("gold card", "amex gold"),
        notes="4x dining (worldwide) & US supermarkets ($25k/yr cap), 3x flights via Amex Travel.",
    ),
    RewardProfile(
        key="amex_platinum",
        display_name="American Express Platinum",
        issuer="American Express",
        base_rate=0.01,
        category_rates={TRAVEL: 0.05},
        annual_fee_cents=69_500,
        match_aliases=("platinum card",),
        notes="5x flights & prepaid hotels via Amex Travel; 1x otherwise.",
    ),
    RewardProfile(
        key="amex_blue_cash_preferred",
        display_name="Amex Blue Cash Preferred",
        issuer="American Express",
        base_rate=0.01,
        category_rates={GROCERIES: 0.06, STREAMING: 0.06, GAS: 0.03, TRANSIT: 0.03},
        category_caps={GROCERIES: _6K},
        annual_fee_cents=9_500,
        match_aliases=("blue cash preferred",),
        notes="6% US supermarkets ($6k/yr cap) & streaming, 3% gas & transit.",
    ),
    RewardProfile(
        key="citi_double_cash",
        display_name="Citi Double Cash",
        issuer="Citi",
        base_rate=0.02,  # 1% on purchase + 1% on payment
        match_aliases=("double cash",),
        notes="2% on everything (1% buy + 1% pay).",
    ),
    RewardProfile(
        key="citi_custom_cash",
        display_name="Citi Custom Cash",
        issuer="Citi",
        base_rate=0.01,
        rotating=True,  # 5% on your top eligible category each cycle ($500/mo cap) — v3
        match_aliases=("custom cash",),
        notes="5% on your top eligible spend category each billing cycle, $500/mo cap, then 1%.",
    ),
    RewardProfile(
        key="capital_one_savor",
        display_name="Capital One Savor",
        issuer="Capital One",
        base_rate=0.01,
        category_rates={DINING: 0.03, GROCERIES: 0.03, STREAMING: 0.03},
        match_aliases=("savor",),
        notes="3% dining, groceries, entertainment & streaming.",
    ),
    RewardProfile(
        key="capital_one_quicksilver",
        display_name="Capital One Quicksilver",
        issuer="Capital One",
        base_rate=0.015,
        match_aliases=("quicksilver",),
        notes="1.5% flat.",
    ),
    RewardProfile(
        key="capital_one_venture",
        display_name="Capital One Venture",
        issuer="Capital One",
        base_rate=0.02,  # 2x miles ~1¢
        category_rates={TRAVEL: 0.05},
        points_value_cents=1.0,
        annual_fee_cents=9_500,
        match_aliases=("venture",),
        notes="2x miles everywhere, 5x on Capital One Travel. Miles worth more via transfer.",
    ),
    RewardProfile(
        key="wells_fargo_active_cash",
        display_name="Wells Fargo Active Cash",
        issuer="Wells Fargo",
        base_rate=0.02,
        match_aliases=("active cash",),
        notes="2% flat.",
    ),
    RewardProfile(
        key="wells_fargo_autograph",
        display_name="Wells Fargo Autograph",
        issuer="Wells Fargo",
        base_rate=0.01,
        category_rates={DINING: 0.03, TRAVEL: 0.03, GAS: 0.03, TRANSIT: 0.03, STREAMING: 0.03},
        match_aliases=("autograph",),
        notes="3x dining, travel, gas, transit, streaming, phone plans.",
    ),
    RewardProfile(
        key="bofa_customized_cash",
        display_name="BofA Customized Cash Rewards",
        issuer="Bank of America",
        base_rate=0.01,
        category_rates={GAS: 0.03, WHOLESALE_CLUB: 0.02, GROCERIES: 0.02},
        category_caps={GAS: 250_000, WHOLESALE_CLUB: 250_000, GROCERIES: 250_000},
        match_aliases=("customized cash",),
        notes="3% in a chosen category (gas default), 2% groceries & wholesale clubs; combined "
        "$2,500/qtr cap. Preferred Rewards can boost.",
    ),
    RewardProfile(
        key="discover_it_miles",
        display_name="Discover it Miles",
        issuer="Discover",
        base_rate=0.015,
        match_aliases=("discover it miles", "discover miles"),
        notes="1.5x miles flat; Mile-for-Mile match year 1.",
    ),
    RewardProfile(
        key="apple_card",
        display_name="Apple Card",
        issuer="Goldman Sachs",
        base_rate=0.01,
        match_aliases=("apple card",),
        notes="3% Apple & select merchants, 2% via Apple Pay, 1% otherwise.",
    ),
    RewardProfile(
        key="us_bank_altitude_go",
        display_name="U.S. Bank Altitude Go",
        issuer="U.S. Bank",
        base_rate=0.01,
        category_rates={DINING: 0.04, GROCERIES: 0.02, GAS: 0.02, STREAMING: 0.02},
        match_aliases=("altitude go",),
        notes="4x dining, 2x groceries/gas/streaming.",
    ),
]

SEED_PROFILES: list[RewardProfile] = [*_USER_CARDS, *_POPULAR_CARDS]

_BY_KEY: dict[str, RewardProfile] = {p.key: p for p in SEED_PROFILES}


def get_profile(key: str) -> RewardProfile | None:
    """Look up a profile by its stable key (e.g. a card's stored ``reward_profile_key``)."""
    return _BY_KEY.get(key)


def _normalize_card_name(name: str) -> str:
    """Lowercase, drop punctuation/digits (masks, ref numbers), collapse whitespace —
    mirrors ``reconcile.normalize_vendor`` so Plaid's noisy account names compare cleanly."""
    tokens = _NON_ALNUM.sub(" ", (name or "").casefold()).split()
    tokens = [t for t in tokens if not t.isdigit()]
    return " ".join(tokens)


def match_profile(plaid_card_name: str) -> RewardProfile | None:
    """Best-effort map a Plaid account name to a seed profile, or None if not confident.

    Plaid account names are terse and inconsistent ("Credit Card", "Platinum Card",
    "Sapphire Preferred", "CREDIT CARD 1234"), and a name+mask rarely pins the exact product
    tier — so a None result (→ the UI asks the user to confirm) is the COMMON path, not an
    edge case (rewards-optimizer-plan §8). Matches on alias substrings; the longest alias
    that appears wins, so "sapphire preferred" beats a hypothetical bare "sapphire".
    """
    normalized = _normalize_card_name(plaid_card_name)
    if not normalized:
        return None
    best: RewardProfile | None = None
    best_len = 0
    for profile in SEED_PROFILES:
        for alias in profile.match_aliases:
            if alias in normalized and len(alias) > best_len:
                best, best_len = profile, len(alias)
    return best
