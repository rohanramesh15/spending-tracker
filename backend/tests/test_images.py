"""Receipt image normalization (plan §6.1, CLAUDE.md #12).

Regression guard for the privacy + model-input invariants: HEIC/anything → JPEG, EXIF
auto-rotate, downscale to <=2000px, and — the privacy-critical one — **all metadata
(incl. GPS) stripped**. No DB, no network.
"""

import io

import pytest
from PIL import Image

from app.services.images import MAX_EDGE, normalize_image


def _jpeg_with_exif(w: int, h: int, *, orientation: int = 1, make: str = "TestCam") -> bytes:
    img = Image.new("RGB", (w, h), (200, 200, 200))
    exif = img.getexif()
    exif[274] = orientation  # Orientation tag
    exif[271] = make  # Make tag (stands in for any identifying metadata, incl. GPS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_output_is_jpeg_rgb():
    png = io.BytesIO()
    Image.new("RGBA", (50, 40)).save(png, format="PNG")
    out = Image.open(io.BytesIO(normalize_image(png.getvalue())))
    assert out.format == "JPEG"
    assert out.mode == "RGB"


def test_strips_all_metadata_including_gps():
    out = Image.open(io.BytesIO(normalize_image(_jpeg_with_exif(60, 40, make="Apple"))))
    exif = out.getexif()
    assert len(exif) == 0, f"metadata survived normalization: {dict(exif)}"
    assert 271 not in exif  # Make gone
    assert 274 not in exif  # Orientation gone (baked in, not carried)


def test_exif_orientation_is_applied():
    # Orientation 6 = rotate 90° → a 100x80 image should come out 80x100.
    out = Image.open(io.BytesIO(normalize_image(_jpeg_with_exif(100, 80, orientation=6))))
    assert out.size == (80, 100)


def test_downscales_to_max_edge():
    big = io.BytesIO()
    Image.new("RGB", (3000, 2000)).save(big, format="JPEG")
    out = Image.open(io.BytesIO(normalize_image(big.getvalue())))
    assert max(out.size) == MAX_EDGE
    assert out.size == (MAX_EDGE, round(MAX_EDGE * 2000 / 3000))


def test_does_not_upscale_small_images():
    small = io.BytesIO()
    Image.new("RGB", (400, 300)).save(small, format="JPEG")
    out = Image.open(io.BytesIO(normalize_image(small.getvalue())))
    assert out.size == (400, 300)


def test_unreadable_bytes_raise_valueerror():
    with pytest.raises(ValueError):
        normalize_image(b"definitely not an image")
