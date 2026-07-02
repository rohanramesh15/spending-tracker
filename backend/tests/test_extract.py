"""Receipt extraction service tests — pure (no DB, no network, mock extractor)."""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from PIL import Image

from app.core.taxonomy import REGULAR_CATEGORIES
from app.services.extract import (
    ExtractedLineItem,
    _extract_mock,
    _parse_wire,
    _to_extracted,
    _WireLineItem,
    _WireReceipt,
)
from app.services.images import normalize_image


def _png_bytes(w: int = 3000, h: int = 100) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 200, 200)).save(buf, format="PNG")
    return buf.getvalue()


def test_normalize_downscales_and_outputs_jpeg() -> None:
    out = normalize_image(_png_bytes(3000, 100))
    assert out[:2] == b"\xff\xd8"  # JPEG magic bytes
    img = Image.open(io.BytesIO(out))
    assert max(img.size) <= 2000  # downscaled to the max edge
    assert img.mode == "RGB"


def test_normalize_rejects_non_image() -> None:
    import pytest

    with pytest.raises(ValueError):
        normalize_image(b"not an image")


def test_mock_extraction_is_valid() -> None:
    # Test the mock directly so the result is deterministic regardless of whether a
    # GEMINI_API_KEY happens to be set in the environment.
    receipt = _extract_mock()
    assert receipt.vendor
    assert receipt.line_items
    # Every category must be a valid taxonomy member; money is integer cents.
    for li in receipt.line_items:
        assert li.category in set(REGULAR_CATEGORIES)
        assert isinstance(li.price_cents, int)


def test_unknown_category_coerced_to_other() -> None:
    li = ExtractedLineItem(raw_name="x", category="Spaceship Parts", price_cents=100)
    assert li.category == "Other"


# --- Gemini wire schema ↔ domain model (no network) --------------------------------


def test_wire_to_extracted_converts_types_and_coerces_category() -> None:
    wire = _WireReceipt(
        vendor="Test Market",
        purchased_on="2026-07-02",
        tax_cents=29,
        total_cents=528,
        line_items=[
            _WireLineItem(raw_name="MILK", category="Dairy", price_cents=399, quantity=2.0),
            _WireLineItem(raw_name="MYSTERY", category="Nonsense", price_cents=129),
        ],
    )
    r = _to_extracted(wire)
    assert r.purchased_on == date(2026, 7, 2)  # string parsed to a local calendar date
    assert isinstance(r.line_items[0].quantity, Decimal)
    assert r.line_items[0].quantity == Decimal("2")  # float -> Decimal, no drift
    assert r.line_items[1].category == "Other"  # non-taxonomy value coerced
    assert all(isinstance(li.price_cents, int) for li in r.line_items)


def test_parse_wire_prefers_parsed_then_falls_back_to_text() -> None:
    wire = _WireReceipt(vendor="X", purchased_on="2026-01-01", total_cents=100)
    assert _parse_wire(SimpleNamespace(parsed=wire, text=None)) is wire

    out = _parse_wire(SimpleNamespace(parsed=None, text=wire.model_dump_json()))
    assert out.vendor == "X" and out.total_cents == 100


def test_parse_wire_raises_without_content() -> None:
    with pytest.raises(ValueError):
        _parse_wire(SimpleNamespace(parsed=None, text=None))


def test_wire_schema_stays_gemini_safe() -> None:
    # Guards against reintroducing Decimal/date into the wire schema: Gemini's controlled
    # generation wants primitives, so quantity must be NUMBER (not a STRING+pattern, which
    # is how a Decimal renders) and purchased_on must be a plain STRING.
    from google.genai import _transformers as t
    from google.genai import types

    schema = t.t_schema(None, _WireReceipt)  # must not raise
    assert schema.properties["purchased_on"].type == types.Type.STRING
    quantity = schema.properties["line_items"].items.properties["quantity"]
    assert quantity.type == types.Type.NUMBER
