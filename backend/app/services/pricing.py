"""Per-unit price normalization + ranking for the cheaper-store finder (plan §6.9 step 4).

Store products list a price and a size buried in a noisy title ("Kroger 2% Reduced Fat
Milk, 1 Gallon"). To compare fairly we parse the size, convert to a common base unit
within a dimension (volume→fl oz, weight→oz, count→ct), and rank by **price per base
unit**. A comparable spec supplies the dimension and, for the ``strict`` tightness,
``exclude_terms`` that keep us from crossing lines (dairy↔plant, organic↔non-organic).

Pure and unit-tested. The LLM only backstops size parsing when the regex misses (done in
the finder endpoint, not here).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

# Conversion factors to each dimension's base unit.
_VOLUME_FLOZ: dict[str, Decimal] = {
    "fl oz": Decimal(1),
    "floz": Decimal(1),
    "oz": Decimal(1),  # "oz" in a volume context
    "gal": Decimal(128),
    "gallon": Decimal(128),
    "gallons": Decimal(128),
    "qt": Decimal(32),
    "quart": Decimal(32),
    "quarts": Decimal(32),
    "pt": Decimal(16),
    "pint": Decimal(16),
    "pints": Decimal(16),
    "l": Decimal("33.814"),
    "liter": Decimal("33.814"),
    "litre": Decimal("33.814"),
    "ml": Decimal("0.033814"),
}
_WEIGHT_OZ: dict[str, Decimal] = {
    "oz": Decimal(1),
    "lb": Decimal(16),
    "lbs": Decimal(16),
    "pound": Decimal(16),
    "pounds": Decimal(16),
    "g": Decimal("0.035274"),
    "gram": Decimal("0.035274"),
    "grams": Decimal("0.035274"),
    "kg": Decimal("35.274"),
}
_COUNT: dict[str, Decimal] = {
    "ct": Decimal(1),
    "count": Decimal(1),
    "pk": Decimal(1),
    "pack": Decimal(1),
    "ea": Decimal(1),
    "each": Decimal(1),
    "rolls": Decimal(1),
    "roll": Decimal(1),
}
_DIMENSIONS = {"volume": _VOLUME_FLOZ, "weight": _WEIGHT_OZ, "count": _COUNT}
_BASE_UNIT = {"volume": "fl oz", "weight": "oz", "count": "ct"}

# Longest units first so "fl oz" wins over "oz", "gallon" over "gal".
_UNIT_ALTS = sorted(
    {u for table in _DIMENSIONS.values() for u in table},
    key=len,
    reverse=True,
)
# Number is a fraction ("1/2") or a decimal ("1", "1.5"). Fraction is tried first so
# "1/2 gal" reads as 0.5 gal, not "2 gal".
_SIZE_RE = re.compile(
    r"(\d+\s*/\s*\d+|\d+(?:\.\d+)?)\s*(" + "|".join(re.escape(u) for u in _UNIT_ALTS) + r")\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ParsedSize:
    value: Decimal
    unit: str  # as written (lowercased)


def _parse_number(text: str) -> Decimal:
    text = text.replace(" ", "")
    if "/" in text:
        num, den = text.split("/", 1)
        return Decimal(num) / Decimal(den)
    return Decimal(text)


def parse_size(title: str) -> ParsedSize | None:
    """Pull the last ``<number> <unit>`` out of a product title (titles trail the size)."""
    matches = _SIZE_RE.findall(title)
    if not matches:
        return None
    value_str, unit = matches[-1]
    return ParsedSize(value=_parse_number(value_str), unit=unit.lower())


def normalize_to_base(size: ParsedSize, dimension: str) -> Decimal | None:
    """Convert a parsed size to the dimension's base unit (fl oz / oz / ct)."""
    table = _DIMENSIONS.get(dimension)
    if table is None:
        return None
    factor = table.get(size.unit)
    if factor is None or size.value <= 0:
        return None
    return size.value * factor


def base_unit_label(dimension: str) -> str:
    return _BASE_UNIT.get(dimension, "unit")


@dataclass(frozen=True)
class RankedProduct:
    title: str
    price_cents: int
    size: ParsedSize | None
    base_quantity: Decimal | None  # size in base units
    unit_price_cents: int | None  # price per base unit (None if size unknown)


def rank_products(
    products: list[tuple[str, int]],
    *,
    dimension: str,
    exclude_terms: list[str] | None = None,
) -> list[RankedProduct]:
    """Rank ``(title, price_cents)`` products by price-per-base-unit, cheapest first.

    Products whose title contains an ``exclude_terms`` word (strict cross-line guard) are
    dropped. Products with an unparseable size sort last (no per-unit comparison possible).
    """
    excludes = [t.lower() for t in (exclude_terms or [])]
    ranked: list[RankedProduct] = []
    for title, price_cents in products:
        low = title.lower()
        if any(term in low for term in excludes):
            continue
        size = parse_size(title)
        base = normalize_to_base(size, dimension) if size else None
        unit_price = (
            int((Decimal(price_cents) / base).to_integral_value()) if base and base > 0 else None
        )
        ranked.append(
            RankedProduct(
                title=title,
                price_cents=price_cents,
                size=size,
                base_quantity=base,
                unit_price_cents=unit_price,
            )
        )

    # Cheapest per-unit first; unknown-size products (None) sink to the bottom.
    ranked.sort(key=lambda p: (p.unit_price_cents is None, p.unit_price_cents or 0))
    return ranked
