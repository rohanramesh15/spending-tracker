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
