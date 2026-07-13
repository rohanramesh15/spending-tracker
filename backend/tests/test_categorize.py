"""The shared categorization algorithm (services/categorize.py) — pure, deterministic, no
DB/network. Regression guard for how receipts / manual entries / bank rows get a category,
and that everything it can emit is a real taxonomy member.
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
        ("FOOD_AND_DRINK", "Food & Drink"),
        ("GENERAL_MERCHANDISE", "Shopping"),
        ("PERSONAL_CARE", "Shopping"),
        ("TRANSPORTATION", "Transportation"),
        ("TRAVEL", "Travel"),
        ("MEDICAL", "Health"),
        ("RENT_AND_UTILITIES", "Services"),
        ("GENERAL_SERVICES", "Services"),
        ("ENTERTAINMENT", "Entertainment"),
        ("food_and_drink", "Food & Drink"),  # case-insensitive
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
        ("Starbucks Coffee", "Food & Drink"),
        ("KROGER #123", "Food & Drink"),
        ("UBER TRIP 3PM", "Transportation"),
        ("Shell Gas Station", "Transportation"),
        ("Netflix.com", "Entertainment"),
        ("CVS Pharmacy", "Health"),
        ("Delta Air Lines", "Travel"),
        ("Marriott Hotel", "Travel"),
        ("Amazon Marketplace", "Shopping"),
        ("Comcast Internet", "Services"),
        ("Zzzq Widget Co", "Other"),
        ("", "Other"),
        (None, "Other"),
    ],
)
def test_from_text(name, expected):
    assert from_text(name) == expected


def test_pfc_beats_text_when_specific():
    # Bank-derived PFC is authoritative: "Amazon" would say Shopping, but PFC says transit.
    assert categorize(name="Amazon", plaid_pfc="TRANSPORTATION") == "Transportation"


def test_falls_back_to_text_when_pfc_unknown():
    assert categorize(name="Starbucks", plaid_pfc="MYSTERY_PFC") == "Food & Drink"


def test_returns_other_when_nothing_matches():
    assert categorize(name="qwerty zxcvbn", plaid_pfc=None) == OTHER


def test_categorize_always_returns_a_valid_category():
    for result in (categorize(name="random junk"), categorize(plaid_pfc="X"), categorize()):
        assert result in REGULAR_CATEGORIES
