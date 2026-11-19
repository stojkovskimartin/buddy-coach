"""Photo processing, free of frameworks: decode safely, shrink, strip metadata."""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from PIL import Image, ImageOps, UnidentifiedImageError

from buddy_coach.core.errors import ValidationFailedError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 25_000_000
"""Larger images are refused before decoding (decompression bombs)."""
FULL_EDGE = 1280
THUMB_EDGE = 320
JPEG_QUALITY = 80
MAX_RANGE_DAYS = 366
ACCEPTED_FORMATS = ("JPEG", "PNG", "WEBP")


class PhotoKind(StrEnum):
    """What a photo shows. Meal photos expire; the others stay until deleted."""

    MEAL = "meal"
    PROGRESS = "progress"
    AVATAR = "avatar"


@dataclass(frozen=True, slots=True)
class ProcessedPhoto:
    """A re-encoded JPEG without metadata, and its thumbnail."""

    full: bytes
    thumb: bytes
    width: int
    height: int


def _jpeg(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)  # no exif, no icc profile
    return out.getvalue()


def process_photo(data: bytes) -> ProcessedPhoto:
    """Decode JPEG, PNG or WebP only, turn it upright, shrink it first (so later steps work on
    1280 px, not on the full image), flatten transparency onto white and re-encode as JPEG;
    EXIF (incl. GPS) and colour profiles are not carried over."""
    try:
        with Image.open(io.BytesIO(data), formats=ACCEPTED_FORMATS) as probe:
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise ValidationFailedError("The photo has too many pixels.")
            probe.verify()
        with Image.open(io.BytesIO(data), formats=ACCEPTED_FORMATS) as source:
            source.seek(0)  # the first frame of an animated image
            source.draft("RGB", (FULL_EDGE, FULL_EDGE))  # JPEG: decode at a reduced scale
            # Shrink before turning upright: the box is square, so the order does not change the
            # result, and no full-size copy is ever made.
            source.thumbnail((FULL_EDGE, FULL_EDGE), Image.Resampling.LANCZOS)
            image = ImageOps.exif_transpose(source)
            if image.mode in ("RGBA", "LA", "PA", "P"):
                rgba = image.convert("RGBA")
                image = Image.new("RGB", rgba.size, "white")
                image.paste(rgba, mask=rgba.getchannel("A"))
            image = image.convert("RGB")
            thumb = image.copy()
            thumb.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.Resampling.LANCZOS)
            return ProcessedPhoto(
                full=_jpeg(image), thumb=_jpeg(thumb), width=image.width, height=image.height
            )
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValidationFailedError("Send a JPEG, PNG or WebP photo.") from exc


def validate_range(start: date, end: date) -> None:
    """History queries are bounded."""
    if end < start:
        raise ValidationFailedError(f"The range ends ({end}) before it starts ({start}).")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationFailedError(f"At most {MAX_RANGE_DAYS} days per request.")
