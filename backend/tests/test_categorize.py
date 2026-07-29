"""The shared categorization algorithm (services/categorize.py) — pure, deterministic, no
DB/network. Regression guard for how receipts / manual entries / bank rows get a category,
that the comprehensive keyword lists place common merchants correctly, and that everything
it can emit is a real taxonomy member.
"""

import pytest

from app.core.taxonomy import REGULAR_CATEGORIES
from app.services.categorize import (
    OTHER,
    PLAID_PFC_DETAILED_MAP,
    PLAID_PFC_MAP,
    categorize,
    from_plaid_pfc,
    from_plaid_pfc_detailed,
    from_text,
    pfc_is_confident,
)


def test_pfc_map_targets_are_all_valid_categories():
    for target in PLAID_PFC_MAP.values():
        assert target in REGULAR_CATEGORIES, target


@pytest.mark.parametrize(
    "pfc,expected",
    [
        ("FOOD_AND_DRINK", "Food and Drinks"),
        ("GENERAL_MERCHANDISE", "Shopping"),
        ("HOME_IMPROVEMENT", "Shopping"),
        ("PERSONAL_CARE", "Shopping"),
        ("TRANSPORTATION", "Travel/Transportation"),  # merged bucket
        ("TRAVEL", "Travel/Transportation"),  # merged bucket
        ("MEDICAL", "Health"),
        ("RENT_AND_UTILITIES", "Services"),
        ("GENERAL_SERVICES", "Services"),
        ("BANK_FEES", "Services"),
        ("ENTERTAINMENT", "Entertainment"),
        ("food_and_drink", "Food and Drinks"),  # case-insensitive
        ("UNMAPPED_THING", "Other"),
        (None, "Other"),
        ("", "Other"),
    ],
)
def test_from_plaid_pfc(pfc, expected):
    assert from_plaid_pfc(pfc) == expected


@pytest.mark.parametrize(
    "name,expected",
    [
        # Food and Drinks
        ("Starbucks Coffee", "Food and Drinks"),
        ("KROGER #123", "Food and Drinks"),
        ("Whole Foods Market", "Food and Drinks"),
        ("Chipotle Mexican Grill", "Food and Drinks"),
        ("DoorDash", "Food and Drinks"),
        ("Uber Eats", "Food and Drinks"),  # beats the 'uber' transit keyword (order)
        # Travel/Transportation (merged)
        ("UBER TRIP 3PM", "Travel/Transportation"),
        ("Shell Gas Station", "Travel/Transportation"),
        ("NY Pay as you go", "Travel/Transportation"),  # the MTA/OMNY miss, now fixed
        ("OMNY MTA", "Travel/Transportation"),
        ("Delta Air Lines", "Travel/Transportation"),
        ("Marriott Hotel", "Travel/Transportation"),
        ("LAX Airport Parking", "Travel/Transportation"),
        # Entertainment
        ("Netflix.com", "Entertainment"),
        ("Steam Games", "Entertainment"),
        ("AMC Theatres", "Entertainment"),
        # Health
        ("CVS Pharmacy", "Health"),
        ("Planet Fitness", "Health"),
        ("Dr. Smith Dental", "Health"),
        # Services
        ("Comcast Internet", "Services"),
        ("Verizon Wireless", "Services"),
        ("Con Edison electric bill", "Services"),
        ("Rent payment", "Services"),
        ("Joe's Barber Shop", "Services"),  # barber wins before Shopping's 'shop'
        # Shopping
        ("Amazon Marketplace", "Shopping"),
        ("Target", "Shopping"),
        ("Best Buy Electronics", "Shopping"),
        # Other / edge
        ("Zzzq Widget Co", "Other"),
        ("", "Other"),
        (None, "Other"),
    ],
)
def test_from_text(name, expected):
    assert from_text(name) == expected


@pytest.mark.parametrize(
    "name",
    ["Las Vegas Nevada", "The Barbershop is closed", "parent teacher night", "restore hardware"],
)
def test_word_boundary_avoids_false_positives(name):
    # These contain 'gas'/'bar'/'rent'/'store' as substrings but NOT as whole tokens, so the
    # bounded matcher must not misfire. (They land in Other or a *correct* bucket, never via
    # the accidental substring.) Chiefly: 'gas' inside 'Vegas' must not read as transport.
    assert from_text("Las Vegas Nevada") == "Other"


def test_pfc_beats_text_when_specific():
    # Bank-derived PFC is authoritative: "Amazon" would say Shopping, but PFC says transit.
    assert categorize(name="Amazon", plaid_pfc="TRANSPORTATION") == "Travel/Transportation"


def test_falls_back_to_text_when_pfc_unknown():
    assert categorize(name="Starbucks", plaid_pfc="MYSTERY_PFC") == "Food and Drinks"


def test_returns_other_when_nothing_matches():
    assert categorize(name="qwerty zxcvbn", plaid_pfc=None) == OTHER


def test_categorize_always_returns_a_valid_category():
    for result in (categorize(name="random junk"), categorize(plaid_pfc="X"), categorize()):
        assert result in REGULAR_CATEGORIES


# --- Detailed PFC (0013): the leaf signal, and how it composes with the others ------------


def test_pfc_detailed_map_targets_are_all_valid_categories():
    for target in PLAID_PFC_DETAILED_MAP.values():
        assert target in REGULAR_CATEGORIES, target


def test_every_detailed_key_is_prefixed_with_a_known_primary():
    # from_plaid_pfc_detailed()'s unknown-leaf fallback relies on this invariant.
    for key in PLAID_PFC_DETAILED_MAP:
        assert any(key.startswith(p) for p in PLAID_PFC_MAP), key


@pytest.mark.parametrize(
    "detailed,expected",
    [
        # The whole point: leaves whose primary maps somewhere WRONG for them.
        ("PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "Health"),  # primary says Shopping
        ("PERSONAL_CARE_HAIR_AND_BEAUTY", "Services"),  # primary says Shopping
        ("PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING", "Services"),  # primary says Shopping
        ("GENERAL_MERCHANDISE_CONVENIENCE_STORES", "Food and Drinks"),  # primary says Shopping
        ("GENERAL_SERVICES_AUTOMOTIVE", "Travel/Transportation"),  # primary says Services
        ("GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT", "Services"),  # primary says Other
        ("HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE", "Services"),  # primary says Shopping
        # The two "gas"es, which no keyword rule can tell apart.
        ("TRANSPORTATION_GAS", "Travel/Transportation"),
        ("RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "Services"),
        # Ordinary leaves agree with their primary.
        ("FOOD_AND_DRINK_GROCERIES", "Food and Drinks"),
        ("ENTERTAINMENT_VIDEO_GAMES", "Entertainment"),
        ("MEDICAL_DENTAL_CARE", "Health"),
        ("food_and_drink_coffee", "Food and Drinks"),  # case-insensitive
        (None, "Other"),
        ("", "Other"),
    ],
)
def test_from_plaid_pfc_detailed(detailed, expected):
    assert from_plaid_pfc_detailed(detailed) == expected


def test_unknown_detailed_leaf_falls_back_to_its_primary():
    # A leaf Plaid adds after this map was written must still land in the right broad bucket.
    assert from_plaid_pfc_detailed("FOOD_AND_DRINK_SOMETHING_NEW") == "Food and Drinks"
    assert from_plaid_pfc_detailed("MEDICAL_BRAND_NEW_THING") == "Health"
    assert from_plaid_pfc_detailed("NOT_A_REAL_PRIMARY_AT_ALL") == OTHER


def test_detailed_outranks_primary():
    # Same row, conflicting signals: the leaf wins because it's more specific.
    assert (
        categorize(
            name="Equinox",
            plaid_pfc="PERSONAL_CARE",
            plaid_pfc_detailed="PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS",
        )
        == "Health"
    )


def test_detailed_outranks_text():
    # "shell gas" keyword-matches transport, but the leaf says it's the utility bill.
    assert (
        categorize(name="Shell Gas", plaid_pfc_detailed="RENT_AND_UTILITIES_GAS_AND_ELECTRICITY")
        == "Services"
    )


@pytest.mark.parametrize("confidence", ["VERY_HIGH", "HIGH", "MEDIUM", None, "", "weird"])
def test_confident_primary_beats_text(confidence):
    # Unknown/absent confidence counts as trustworthy — rows synced before we captured it.
    assert (
        categorize(name="Amazon", plaid_pfc="TRANSPORTATION", plaid_pfc_confidence=confidence)
        == "Travel/Transportation"
    )


@pytest.mark.parametrize("confidence", ["LOW", "UNKNOWN", "low", " unknown "])
def test_weak_primary_yields_to_text(confidence):
    # Plaid itself doubts the guess, so our keyword read of the merchant answers first.
    assert (
        categorize(name="Starbucks", plaid_pfc="TRANSPORTATION", plaid_pfc_confidence=confidence)
        == "Food and Drinks"
    )


def test_weak_primary_still_used_when_text_says_nothing():
    # A doubted guess still beats no answer at all.
    assert (
        categorize(
            name="QZX9 UNKNOWABLE LLC",
            plaid_pfc="TRANSPORTATION",
            plaid_pfc_confidence="LOW",
        )
        == "Travel/Transportation"
    )


def test_weak_confidence_does_not_weaken_the_detailed_leaf():
    # Confidence gates the coarse primary only; the leaf is still the best thing we have.
    assert (
        categorize(
            name="Starbucks",
            plaid_pfc="PERSONAL_CARE",
            plaid_pfc_detailed="PERSONAL_CARE_HAIR_AND_BEAUTY",
            plaid_pfc_confidence="LOW",
        )
        == "Services"
    )


def test_pfc_is_confident():
    assert pfc_is_confident("VERY_HIGH") is True
    assert pfc_is_confident(None) is True
    assert pfc_is_confident("LOW") is False
    assert pfc_is_confident("UNKNOWN") is False


def test_categorize_with_all_signals_always_returns_a_valid_category():
    for result in (
        categorize(plaid_pfc_detailed="TOTAL_GARBAGE"),
        categorize(plaid_pfc="X", plaid_pfc_confidence="LOW"),
        categorize(name="junk", plaid_pfc_detailed="", plaid_pfc_confidence="UNKNOWN"),
    ):
        assert result in REGULAR_CATEGORIES
