"""Photo use cases. Files are written before the record is committed and removed after it is
deleted, so a record never points at a missing file."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Protocol

from anyio import CancelScope, CapacityLimiter, to_thread
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.clock import local_date
from buddy_coach.core.deps import Clock
from buddy_coach.core.errors import NotFoundError
from buddy_coach.media.domain import PhotoKind, process_photo, validate_range
from buddy_coach.media.models import Photo
from buddy_coach.media.repository import PhotoRepository
from buddy_coach.media.schemas import PhotoRecord
from buddy_coach.media.storage import PhotoStorage, Size

logger = logging.getLogger(__name__)

PROCESSING = CapacityLimiter(2)
"""Decoding a large photo takes a few hundred MB for a moment; at most two at a time."""


class TimezoneLookup(Protocol):
    """What the media module needs from the profile module."""

    async def timezone_for(self, user_id: uuid.UUID) -> str | None: ...


class PhotoService:
    """Commits its own transactions."""

    def __init__(
        self,
        session: AsyncSession,
        storage: PhotoStorage,
        profiles: TimezoneLookup,
        now: Clock,
        meal_retention_days: int,
    ) -> None:
        self._session = session
        self._repo = PhotoRepository(session)
        self._storage = storage
        self._profiles = profiles
        self._now = now
        self._meal_retention = timedelta(days=meal_retention_days)

    async def upload(self, user_id: uuid.UUID, kind: PhotoKind, data: bytes) -> Photo:
        """Shrink and store a photo. A new avatar replaces the old one; meal photos older than
        the retention period are removed on the way."""
        processed = await to_thread.run_sync(process_photo, data, limiter=PROCESSING)
        today = await self.today(user_id)
        photo = Photo(
            id=uuid.uuid4(),
            user_id=user_id,
            kind=kind,
            day=today,
            width=processed.width,
            height=processed.height,
        )
        await self._storage.put(user_id, photo.id, processed.full, processed.thumb)
        try:
            replaced = list(await self._repo.expired_meals(user_id, today - self._meal_retention))
            if kind is PhotoKind.AVATAR:
                replaced += await self._repo.of_kind(user_id, PhotoKind.AVATAR)
            await self._repo.remove(replaced)
            self._repo.add(photo)
            await self._session.commit()
        except BaseException:
            with CancelScope(shield=True):  # clean up even when the request was cancelled
                await self._storage.delete(user_id, photo.id)
            raise
        await self._delete_files(user_id, replaced)
        return photo

    async def history(
        self, user_id: uuid.UUID, kind: PhotoKind | None, start: date, end: date
    ) -> Sequence[Photo]:
        """Photos in a date range, newest first."""
        validate_range(start, end)
        return await self._repo.between(user_id, kind, start, end)

    async def avatar(self, user_id: uuid.UUID) -> Sequence[Photo]:
        """The current profile picture (none or one)."""
        return await self._repo.of_kind(user_id, PhotoKind.AVATAR)

    async def image(self, user_id: uuid.UUID, photo_id: uuid.UUID, size: Size) -> bytes:
        """The JPEG of one of the user's photos."""
        photo = await self._get(user_id, photo_id)
        return await self._storage.get(user_id, photo.id, size)

    async def delete(self, user_id: uuid.UUID, photo_id: uuid.UUID) -> None:
        """Remove a photo and its files."""
        photo = await self._get(user_id, photo_id)
        await self._repo.remove([photo])
        await self._session.commit()
        await self._delete_files(user_id, [photo])

    async def today(self, user_id: uuid.UUID) -> date:
        """Today in the athlete's time zone."""
        return local_date(self._now(), await self._profiles.timezone_for(user_id))

    async def export_user(self, user_id: uuid.UUID) -> list[PhotoRecord]:
        """Every photo record of the user, for the data export."""
        return [PhotoRecord.model_validate(row) for row in await self._repo.all_of(user_id)]

    async def erase_user(self, user_id: uuid.UUID) -> None:
        """Delete every photo record of the user. Joins the caller's transaction (no commit)."""
        await self._repo.erase(user_id)

    async def delete_user_files(self, user_id: uuid.UUID) -> None:
        """Remove all of the user's photo files, after ``erase_user`` was committed."""
        try:
            await self._storage.delete_user(user_id)
        except OSError:
            # The records are gone; left-over files are only disk space. Id only, no content.
            logger.warning("photo_dir_not_deleted", extra={"user_id": str(user_id)})

    async def _get(self, user_id: uuid.UUID, photo_id: uuid.UUID) -> Photo:
        photo = await self._repo.get(user_id, photo_id)
        if photo is None:
            raise NotFoundError("Photo not found.")
        return photo

    async def _delete_files(self, user_id: uuid.UUID, photos: Sequence[Photo]) -> None:
        for photo in photos:
            try:
                await self._storage.delete(user_id, photo.id)
            except OSError:
                # The record is gone; a left-over file is only disk space. Ids only, no content.
                logger.warning("photo_file_not_deleted", extra={"photo_id": str(photo.id)})
