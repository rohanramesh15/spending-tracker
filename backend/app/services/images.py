"""Receipt image normalization before extraction (plan §6.1).

- HEIC/HEIF → JPEG (iPhones capture HEIC by default)
- EXIF auto-rotate (so the model sees the receipt upright)
- downscale to a max longest edge (~2000px) to cut tokens/latency
- strip ALL metadata (re-encoding without an exif block drops GPS etc.)

pillow-heif ships native libs — this works locally via wheels; in Lambda it must be
built in a matching container (`sam build --use-container`, already configured).
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

MAX_EDGE = 2000
JPEG_QUALITY = 85


def normalize_image(raw: bytes) -> bytes:
    """Return normalized JPEG bytes. Raises ValueError if the bytes aren't an image."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:  # noqa: BLE001 - surface any decode failure uniformly
        raise ValueError("Unreadable image") from exc

    # Apply EXIF orientation, then flatten to RGB (drops alpha; also detaches EXIF).
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Downscale so the longest edge is <= MAX_EDGE (never upscale).
    longest = max(img.size)
    if longest > MAX_EDGE:
        scale = MAX_EDGE / longest
        img = img.resize((round(img.width * scale), round(img.height * scale)))

    out = io.BytesIO()
    # No exif= passed → metadata (incl. GPS) is not written.
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()
