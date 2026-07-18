"""Pure unit tests for the rewards optimizer (rewards-optimizer-plan §3).

No DB, no network — mirrors tests/test_categorize.py. Covers the reward-category split, the
Plaid-name → profile matcher, and the cap-aware optimizer.
"""

from __future__ import annotations

from app.services.reward_kb import get_profile, match_profile
from app.services.rewards import CategoryReco, optimize, reward_category


# --- reward_category: the split that our coarse taxonomy can't express -------------------
def test_reward_category_splits_vendors():
    assert reward_category("Whole Foods Market #123") == "groceries"
    assert reward_category("CHIPOTLE 4457") == "dining"
    assert reward_category("Shell Oil 5566") == "gas"
    assert reward_category("DELTA AIR LINES") == "travel"
    assert reward_category("UBER TRIP") == "transit"
    assert reward_category("Netflix.com") == "streaming"
    assert reward_category("CVS/PHARMACY #01") == "drugstore"
    assert reward_category("COSTCO WHSE #0455") == "wholesale_club"
    assert reward_category("AMAZON.COM*2X4Y1") == "online_retail"
    assert reward_category("Some Random LLC") == "other"


def test_uber_eats_is_dining_not_transit():
    # "uber eats" (dining) is checked before "uber" (transit).
    assert reward_category("UBER EATS") == "dining"
    assert reward_category("Uber Eats Delivery") == "dining"


def test_costco_is_wholesale_not_groceries():
    assert reward_category("COSTCO GAS") != "groceries"


def test_reward_category_prefers_plaid_detailed_pfc():
    # A vendor that would keyword-match dining, but PFC says groceries → trust PFC (v2).
    assert reward_category("SQ *THE COFFEE BAR", "FOOD_AND_DRINK_GROCERIES") == "groceries"
    # Unknown/absent PFC falls back to the vendor classifier.
    assert reward_category("Netflix", None) == "streaming"
    assert reward_category("Netflix", "SOME_UNKNOWN_PFC") == "streaming"


# --- match_profile: Plaid account name → seed profile -----------------------------------
def test_match_profile_clean_names():
    assert match_profile("Blue Cash Everyday").key == "amex_blue_cash_everyday"
    assert match_profile("Freedom Unlimited").key == "chase_freedom_unlimited"
    assert match_profile("Sapphire Preferred").key == "chase_sapphire_preferred"
    assert match_profile("CREDIT CARD - Discover it 1234").key == "discover_it_cash"


def test_match_profile_longest_alias_wins():
    # "blue cash preferred" must beat a bare/partial match, not collapse to everyday.
    assert match_profile("Blue Cash Preferred").key == "amex_blue_cash_preferred"


def test_match_profile_generic_name_returns_none():
    assert match_profile("Credit Card") is None
    assert match_profile("") is None
    assert match_profile("Checking ****1234") is None


def test_get_profile_roundtrip():
    assert get_profile("amex_blue_cash_everyday").display_name == "Amex Blue Cash Everyday"
    assert get_profile("nope") is None


# --- optimize: best card per category, cap-aware ----------------------------------------
def _wallet(*keys: str):
    return [get_profile(k) for k in keys]


def test_optimize_picks_best_card_per_category():
    wallet = _wallet("chase_freedom_unlimited", "amex_blue_cash_everyday", "citi_double_cash")
    # $1000 groceries + $1000 dining over 90 days.
    recos = optimize({"groceries": 100_000, "dining": 100_000}, wallet, window_days=90)
    by_cat = {r.reward_category: r for r in recos}
    # Groceries: BCE 3% beats Double Cash 2% and Freedom base 1.5%.
    assert by_cat["groceries"].best_card_key == "amex_blue_cash_everyday"
    # Dining: Freedom Unlimited 3% beats Double Cash 2% and BCE base 1%.
    assert by_cat["dining"].best_card_key == "chase_freedom_unlimited"


def test_optimize_applies_annual_cap():
    # Annualized grocery spend well above BCE's $6k/yr cap: effective rate must fall below 3%.
    wallet = _wallet("amex_blue_cash_everyday")
    # $10k over 365 days => annualized $10k, cap $6k @3% + $4k @1% = $220 on $10k = 2.2%.
    recos = optimize({"groceries": 1_000_000}, wallet, window_days=365)
    reco = recos[0]
    assert reco.best_card_key == "amex_blue_cash_everyday"
    assert reco.est_annual_reward_cents == 22_000  # 6000*0.03 + 4000*0.01 = 180+40 = $220
    assert 0.021 < reco.best_rate < 0.023  # ~2.2%, NOT the headline 3%


def test_optimize_cap_lets_a_flat_card_win_at_high_volume():
    # At very high grocery volume, Double Cash's uncapped 2% beats BCE's capped 3%.
    wallet = _wallet("amex_blue_cash_everyday", "citi_double_cash")
    recos = optimize({"groceries": 5_000_000}, wallet, window_days=365)  # $50k/yr
    # BCE: 6000*.03 + 44000*.01 = 180+440 = $620. Double Cash: 50000*.02 = $1000. DC wins.
    assert recos[0].best_card_key == "citi_double_cash"


def test_optimize_skips_other_and_zero_spend():
    wallet = _wallet("citi_double_cash")
    recos = optimize({"other": 500_000, "dining": 0, "gas": 100_00}, wallet, window_days=90)
    cats = {r.reward_category for r in recos}
    assert "other" not in cats
    assert "dining" not in cats  # zero spend
    assert "gas" in cats


def test_optimize_sorted_by_annualized_spend_desc():
    wallet = _wallet("citi_double_cash")
    recos = optimize({"gas": 10_000, "groceries": 90_000, "dining": 50_000}, wallet, 90)
    assert [r.reward_category for r in recos] == ["groceries", "dining", "gas"]


def test_optimize_rotating_card_treated_as_base_until_v3():
    # Discover it (rotating) has no year-round grocery bonus, so it earns only its 1% base —
    # it must NOT be recommended over a real 3% grocery card.
    wallet = _wallet("discover_it_cash", "amex_blue_cash_everyday")
    recos = optimize({"groceries": 100_000}, wallet, window_days=90)
    assert recos[0].best_card_key == "amex_blue_cash_everyday"


def test_optimize_empty_inputs():
    assert optimize({}, _wallet("citi_double_cash"), 90) == []
    assert optimize({"dining": 100_000}, [], 90) == []
    assert optimize({"dining": 100_000}, _wallet("citi_double_cash"), 0) == []


def test_category_reco_v2_fields_default_none():
    wallet = _wallet("citi_double_cash")
    reco = optimize({"dining": 100_000}, wallet, 90)[0]
    assert isinstance(reco, CategoryReco)
    assert reco.current_card_key is None
    assert reco.est_annual_missed_cents is None
