"""The shared categorization algorithm (services/categorize.py) — pure, deterministic, no
DB/network. Regression guard for how receipts / manual entries / bank rows get a category,
that the comprehensive keyword lists place common merchants correctly, and that everything
it can emit is a real taxonomy member.
"""

import pytest

from app.core.taxonomy import REGULAR_CATEGORIES
from app.services.categorize import (
    OTHER,
    PLAID_PFC_MAP,
    categorize,
    from_plaid_pfc,
    from_text,
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
