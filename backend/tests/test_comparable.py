"""Comparable-spec builder tests — pure (mock path + wire→spec conversion), no network."""

from __future__ import annotations

from decimal import Decimal

from app.services.comparable import ComparableSpec, _build_mock, _to_spec, _WireSpec


def test_mock_spec_for_2pct_milk_guards_cross_lines() -> None:
    spec = _build_mock("milk, 2%")
    assert spec.search_term == "2% milk"
    assert spec.dimension == "volume"
    assert spec.size_value == Decimal(1) and spec.size_unit == "gal"
    # Never silently substitute plant milks / organic on a strict match.
    for banned in ("almond", "oat", "soy", "organic"):
        assert banned in spec.exclude_terms


def test_mock_spec_generic_fallback() -> None:
    spec = _build_mock("paper towels")
    assert isinstance(spec, ComparableSpec)
    assert spec.search_term == "paper towels"
    assert spec.dimension == "count"  # a safe default when the LLM isn't consulted


def test_wire_dimension_is_coerced_to_a_known_value() -> None:
    assert _WireSpec(search_term="x", dimension="nonsense").dimension == "count"
    assert _WireSpec(search_term="x", dimension="weight").dimension == "weight"


def test_to_spec_normalizes_units_and_terms() -> None:
    wire = _WireSpec(
        search_term="  2% milk  ",
        dimension="volume",
        typical_size_value=1.0,
        typical_size_unit="GAL",
        attributes=[" 2% fat ", ""],
        exclude_terms=[" Almond ", "OAT"],
    )
    spec = _to_spec("milk, 2%", wire)
    assert spec.search_term == "2% milk"
    assert spec.size_value == Decimal("1") and spec.size_unit == "gal"
    assert spec.attributes == ["2% fat"]  # trimmed, blanks dropped
    assert spec.exclude_terms == ["almond", "oat"]  # lowercased, trimmed
