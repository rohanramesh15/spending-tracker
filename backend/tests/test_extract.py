"""Receipt extraction service tests — pure (no DB, no network, mock extractor)."""

from __future__ import annotations

import io

from PIL import Image

from app.core.taxonomy import REGULAR_CATEGORIES
from app.services.extract import ExtractedLineItem, _extract_mock
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
