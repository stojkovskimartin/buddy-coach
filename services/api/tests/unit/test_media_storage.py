"""Removing all of a user's photo files on account deletion."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

import pytest

from buddy_coach.media.service import PhotoService
from buddy_coach.media.storage import LocalPhotoStorage


async def test_delete_user_removes_only_that_users_folder_and_can_repeat(tmp_path: Path) -> None:
    storage = LocalPhotoStorage(str(tmp_path))
    gone, kept = uuid.uuid4(), uuid.uuid4()
    await storage.put(gone, uuid.uuid4(), b"full", b"thumb")
    await storage.put(kept, uuid.uuid4(), b"full", b"thumb")

    await storage.delete_user(gone)
    await storage.delete_user(gone)  # nothing left: no error

    assert not (tmp_path / str(gone)).exists()
    assert len(list((tmp_path / str(kept)).iterdir())) == 2


async def test_a_user_without_photos_is_fine(tmp_path: Path) -> None:
    await LocalPhotoStorage(str(tmp_path)).delete_user(uuid.uuid4())


async def test_a_failed_removal_is_logged_with_the_user_id_only(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    class Broken(LocalPhotoStorage):
        async def delete_user(self, user_id: uuid.UUID) -> None:
            raise PermissionError("denied")

    user_id = uuid.uuid4()
    service = PhotoService(
        None,  # type: ignore[arg-type]  # the session is not used for files
        Broken(str(tmp_path)),
        None,  # type: ignore[arg-type]
        now=lambda: None,  # type: ignore[arg-type,return-value]
        meal_retention_days=1,
    )
    with caplog.at_level(logging.WARNING):
        await service.delete_user_files(user_id)

    assert [(r.message, r.__dict__.get("user_id")) for r in caplog.records] == [
        ("photo_dir_not_deleted", str(user_id))
    ]


async def test_a_symlinked_user_folder_is_refused_and_nothing_outside_is_removed(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    root, outside = tmp_path / "photos", tmp_path / "elsewhere"
    root.mkdir()
    outside.mkdir()
    (outside / "keep.jpg").write_bytes(b"jpeg")
    user_id = uuid.uuid4()
    (root / str(user_id)).symlink_to(outside, target_is_directory=True)
    service = PhotoService(
        None,  # type: ignore[arg-type]  # the session is not used for files
        LocalPhotoStorage(str(root)),
        None,  # type: ignore[arg-type]
        now=lambda: None,  # type: ignore[arg-type,return-value]
        meal_retention_days=1,
    )
    with caplog.at_level(logging.WARNING):
        await service.delete_user_files(user_id)

    assert (outside / "keep.jpg").read_bytes() == b"jpeg"
    assert [(r.message, r.__dict__.get("user_id")) for r in caplog.records] == [
        ("photo_dir_not_deleted", str(user_id))
    ]
