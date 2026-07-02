"""Per-unit pricing/ranking tests — pure, no DB (plan §6.9)."""

from __future__ import annotations

from decimal import Decimal

from app.services.pricing import (
    normalize_to_base,
    parse_size,
    rank_products,
)


def test_parse_size_takes_the_trailing_size() -> None:
    s = parse_size("Kroger 2% Reduced Fat Milk, 1 Gallon")
    assert s is not None and s.value == Decimal(1) and s.unit == "gallon"
    assert parse_size("Horizon Organic Whole Milk 128 fl oz").unit == "fl oz"
    assert parse_size("Charmin Bath Tissue, 12 ct").value == Decimal(12)
    assert parse_size("Bananas, each") is None  # no numeric size to parse
    assert parse_size("Just a name with no size") is None


def test_normalize_to_base_across_units() -> None:
    assert normalize_to_base(parse_size("1 gal"), "volume") == Decimal(128)
    assert normalize_to_base(parse_size("1 qt"), "volume") == Decimal(32)
    assert normalize_to_base(parse_size("2 lb"), "weight") == Decimal(32)
    # Wrong dimension for the unit → no conversion.
    assert normalize_to_base(parse_size("1 gal"), "weight") is None


def test_ranking_is_by_price_per_base_unit() -> None:
    products = [
        ("Store Brand 2% Milk, 1 gal", 249),  # 249 / 128 floz ≈ 1.9c/floz  (cheapest)
        ("Name Brand 2% Milk, 1 qt", 199),  # 199 / 32 floz ≈ 6.2c/floz
        ("Half Gallon 2% Milk, 64 fl oz", 189),  # 189 / 64 ≈ 3.0c/floz
    ]
    ranked = rank_products(products, dimension="volume")
    assert [r.title.split(",")[0] for r in ranked] == [
        "Store Brand 2% Milk",
        "Half Gallon 2% Milk",
        "Name Brand 2% Milk",
    ]
    assert ranked[0].unit_price_cents == 2  # round(249/128)


def test_exclude_terms_drop_cross_line_products() -> None:
    products = [
        ("Kroger 2% Milk, 1 gal", 249),
        ("Silk Oat Milk, 64 fl oz", 399),  # plant → excluded for strict dairy
        ("Horizon Organic 2% Milk, 1 gal", 599),  # organic → excluded
    ]
    ranked = rank_products(products, dimension="volume", exclude_terms=["oat", "organic"])
    assert [r.title for r in ranked] == ["Kroger 2% Milk, 1 gal"]


def test_unparseable_size_sorts_last() -> None:
    ranked = rank_products(
        [("Mystery Milk", 300), ("Kroger 2% Milk, 1 gal", 249)],
        dimension="volume",
    )
    assert ranked[0].title == "Kroger 2% Milk, 1 gal"
    assert ranked[-1].title == "Mystery Milk"
    assert ranked[-1].unit_price_cents is None
