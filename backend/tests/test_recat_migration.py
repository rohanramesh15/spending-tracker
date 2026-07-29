"""Guards the recategorization migrations' mappings (not the SQL run — that's exercised
against Postgres). Ensures each old→new map is total with valid targets, the migration chain
is continuous (0004 starts where 0003 ended), and the LATEST migration's NEW list stays in
lockstep with the live taxonomy — so code and data can't drift apart.
"""

import importlib.util
import pathlib

from app.core.taxonomy import REGULAR_CATEGORIES

_VERSIONS = pathlib.Path(__file__).resolve().parent.parent / "alembic/versions"


def _load(filename: str, name: str):
    spec = importlib.util.spec_from_file_location(name, _VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mig3 = _load("0003_recategorize_taxonomy.py", "mig0003")
mig4 = _load("0004_merge_travel_transportation.py", "mig0004")
_ALL = (mig3, mig4)


def test_latest_migration_matches_live_taxonomy():
    # 0004 is the newest recat migration, so its NEW list defines the current taxonomy.
    assert mig4.NEW_REGULAR == list(REGULAR_CATEGORIES)


def test_migration_chain_is_continuous():
    # 0004 must transform exactly the shape 0003 produced.
    assert mig4.OLD_REGULAR == mig3.NEW_REGULAR


def test_every_old_category_has_a_mapping():
    for mig in _ALL:
        for old in mig.OLD_REGULAR:
            assert old in mig.OLD_TO_NEW, f"{mig.__name__}: no mapping for {old!r}"


def test_all_mapping_targets_are_valid_new_categories():
    for mig in _ALL:
        for target in mig.OLD_TO_NEW.values():
            assert target in mig.NEW_REGULAR, f"{mig.__name__}: {target}"


def test_obsolete_is_exactly_the_non_surviving_old_categories():
    for mig in _ALL:
        for name in mig.OBSOLETE:
            assert name not in mig.NEW_REGULAR
        for old in mig.OLD_REGULAR:
            if old not in mig.NEW_REGULAR:
                assert old in mig.OBSOLETE, f"{mig.__name__}: {old!r} missing from OBSOLETE"


# --- 0013: no taxonomy change, but a recategorization pass (detailed PFC) ------------------

mig13 = _load("0013_pfc_detailed_recategorize.py", "mig0013")


def test_0013_old_resolver_reproduces_pre_change_behavior():
    """0013 rewrites a row only when its category still equals what the OLD resolver produced,
    so that frozen copy must keep matching the pre-0013 rule: confident-agnostic primary map
    first, then the keyword classifier."""
    from app.services.categorize import from_plaid_pfc, from_text

    for vendor, pfc in (
        ("Equinox", "PERSONAL_CARE"),
        ("Starbucks", "MYSTERY_PFC"),
        ("Shell Gas", None),
        ("qwerty zxcvbn", None),
    ):
        expected = (
            from_plaid_pfc(pfc) if pfc and from_plaid_pfc(pfc) != "Other" else from_text(vendor)
        )
        assert mig13._old_categorize(vendor, pfc) == expected


def test_0013_only_rewrites_rows_the_new_resolver_actually_moves():
    """The straddling leaves are the point of the migration: old and new must disagree there,
    and agree everywhere the primary was already right (so untouched rows aren't churned)."""
    from app.services.categorize import categorize

    moved = [
        ("Equinox", "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "Health"),
        ("Great Clips", "PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY", "Services"),
        ("Jiffy Lube", "GENERAL_SERVICES", "GENERAL_SERVICES_AUTOMOTIVE", "Travel/Transportation"),
        ("IRS", "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT", "Services"),
        (
            "7-Eleven",
            "GENERAL_MERCHANDISE",
            "GENERAL_MERCHANDISE_CONVENIENCE_STORES",
            "Food and Drinks",
        ),
    ]
    for vendor, primary, detailed, expected in moved:
        new = categorize(name=vendor, plaid_pfc=primary, plaid_pfc_detailed=detailed)
        assert new == expected, vendor
        assert new != mig13._old_categorize(vendor, primary), vendor

    unchanged = [
        ("Whole Foods", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
        ("Delta", "TRAVEL", "TRAVEL_FLIGHTS"),
        ("CVS", "MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS"),
    ]
    for vendor, primary, detailed in unchanged:
        assert categorize(
            name=vendor, plaid_pfc=primary, plaid_pfc_detailed=detailed
        ) == mig13._old_categorize(vendor, primary), vendor
