"""Guards the 0003 recategorization migration's mapping (not the SQL run — that's exercised
against Postgres). Ensures the old→new map is total, targets are valid, and the migration's
NEW list stays in lockstep with the live taxonomy, so code and data can't drift apart.
"""

import importlib.util
import pathlib

from app.core.taxonomy import REGULAR_CATEGORIES


def _load_migration():
    path = (
        pathlib.Path(__file__).resolve().parent.parent
        / "alembic/versions/0003_recategorize_taxonomy.py"
    )
    spec = importlib.util.spec_from_file_location("mig0003", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mig = _load_migration()


def test_migration_new_list_matches_live_taxonomy():
    assert mig.NEW_REGULAR == list(REGULAR_CATEGORIES)


def test_every_old_category_has_a_mapping():
    for old in mig.OLD_REGULAR:
        assert old in mig.OLD_TO_NEW, f"no mapping for old category {old!r}"


def test_all_mapping_targets_are_valid_new_categories():
    for target in mig.OLD_TO_NEW.values():
        assert target in mig.NEW_REGULAR, target


def test_obsolete_is_exactly_the_non_surviving_old_categories():
    for name in mig.OBSOLETE:
        assert name not in mig.NEW_REGULAR
    for old in mig.OLD_REGULAR:
        if old not in mig.NEW_REGULAR:
            assert old in mig.OBSOLETE, f"{old!r} should be deleted but isn't in OBSOLETE"
