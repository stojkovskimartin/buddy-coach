from __future__ import annotations

import io

import pytest
from PIL import Image

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.media import domain
from buddy_coach.media.domain import FULL_EDGE, THUMB_EDGE, process_photo


def _image(fmt: str, size: tuple[int, int], mode: str = "RGB", **save: object) -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, (200, 10, 10, 0) if mode == "RGBA" else "red").save(
        out, format=fmt, **save
    )
    return out.getvalue()


def test_a_large_photo_is_shrunk_to_jpeg_without_exif() -> None:
    exif = Image.Exif()
    exif[0x8825] = {2: (46.0, 57.0, 0.0)}  # a GPS position
    photo = process_photo(_image("JPEG", (4000, 3000), exif=exif))
    with Image.open(io.BytesIO(photo.full)) as full, Image.open(io.BytesIO(photo.thumb)) as thumb:
        assert (full.format, full.size) == ("JPEG", (FULL_EDGE, 960))
        assert max(thumb.size) == THUMB_EDGE
        assert not full.getexif()
        assert not thumb.getexif()
    assert (photo.width, photo.height) == (FULL_EDGE, 960)


def test_colour_profiles_are_not_carried_over() -> None:
    photo = process_photo(_image("JPEG", (100, 100), icc_profile=b"\0" * 128))
    with Image.open(io.BytesIO(photo.full)) as full:
        assert "icc_profile" not in full.info


def test_the_camera_orientation_is_applied() -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # rotated 90 degrees
    photo = process_photo(_image("JPEG", (400, 200), exif=exif))
    assert (photo.width, photo.height) == (200, 400)


def test_transparent_png_and_webp_become_white_backed_jpegs() -> None:
    for fmt in ("PNG", "WEBP"):
        photo = process_photo(_image(fmt, (64, 64), mode="RGBA"))
        with Image.open(io.BytesIO(photo.full)) as full:
            assert full.mode == "RGB"
            assert full.getpixel((0, 0)) == pytest.approx((255, 255, 255), abs=3)


def test_other_files_and_huge_images_are_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    for data in [b"not an image", _image("GIF", (10, 10)), _image("BMP", (10, 10))]:
        with pytest.raises(ValidationFailedError, match="JPEG, PNG or WebP"):
            process_photo(data)
    monkeypatch.setattr(domain, "MAX_PIXELS", 100)
    with pytest.raises(ValidationFailedError, match="too many pixels"):
        process_photo(_image("PNG", (20, 20)))
