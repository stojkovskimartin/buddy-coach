"""Where photo files live: local disk now; an S3-compatible store can implement the Protocol."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Literal, Protocol

from anyio import to_thread

from buddy_coach.core.errors import NotFoundError

Size = Literal["full", "thumb"]


class PhotoStorage(Protocol):
    """Stores the two JPEGs of a photo under the owner's id."""

    async def put(
        self, user_id: uuid.UUID, photo_id: uuid.UUID, full: bytes, thumb: bytes
    ) -> None: ...

    async def get(self, user_id: uuid.UUID, photo_id: uuid.UUID, size: Size) -> bytes: ...

    async def delete(self, user_id: uuid.UUID, photo_id: uuid.UUID) -> None: ...

    async def delete_user(self, user_id: uuid.UUID) -> None:
        """Remove every file of the user; nothing happens if there are none."""
        ...


class LocalPhotoStorage:
    """Files under ``root/<user_id>/<photo_id>[_thumb].jpg``. Paths are built from UUIDs only, so
    no input can point outside the root."""

    def __init__(self, root: str) -> None:
        self._root = Path(root)

    def _path(self, user_id: uuid.UUID, photo_id: uuid.UUID, size: Size) -> Path:
        suffix = "_thumb" if size == "thumb" else ""
        return self._root / str(user_id) / f"{photo_id}{suffix}.jpg"

    def _put(self, user_id: uuid.UUID, photo_id: uuid.UUID, full: bytes, thumb: bytes) -> None:
        (self._root / str(user_id)).mkdir(parents=True, exist_ok=True)
        self._path(user_id, photo_id, "full").write_bytes(full)
        self._path(user_id, photo_id, "thumb").write_bytes(thumb)

    def _delete(self, user_id: uuid.UUID, photo_id: uuid.UUID) -> None:
        self._path(user_id, photo_id, "full").unlink(missing_ok=True)
        self._path(user_id, photo_id, "thumb").unlink(missing_ok=True)

    # Disk access runs in a worker thread so it never blocks the event loop.
    async def put(self, user_id: uuid.UUID, photo_id: uuid.UUID, full: bytes, thumb: bytes) -> None:
        await to_thread.run_sync(self._put, user_id, photo_id, full, thumb)

    async def get(self, user_id: uuid.UUID, photo_id: uuid.UUID, size: Size) -> bytes:
        try:
            return await to_thread.run_sync(self._path(user_id, photo_id, size).read_bytes)
        except FileNotFoundError as exc:
            raise NotFoundError("Photo not found.") from exc

    async def delete(self, user_id: uuid.UUID, photo_id: uuid.UUID) -> None:
        await to_thread.run_sync(self._delete, user_id, photo_id)

    async def delete_user(self, user_id: uuid.UUID) -> None:
        await to_thread.run_sync(self._delete_user, user_id)

    def _delete_user(self, user_id: uuid.UUID) -> None:
        folder = self._root / str(user_id)
        if folder.exists():
            shutil.rmtree(folder)
