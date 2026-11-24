"""Persistence for photo records."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.media.domain import PhotoKind
from buddy_coach.media.models import Photo


class PhotoRepository:
    """Data access for photo records. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, photo: Photo) -> None:
        """Stage a new photo record."""
        self._session.add(photo)

    async def get(self, user_id: uuid.UUID, photo_id: uuid.UUID) -> Photo | None:
        """A photo, only if it belongs to the user."""
        result = await self._session.execute(
            select(Photo).where(Photo.id == photo_id, Photo.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def remove(self, photos: Sequence[Photo]) -> None:
        """Delete photo records."""
        if photos:
            await self._session.execute(delete(Photo).where(Photo.id.in_([p.id for p in photos])))

    async def of_kind(self, user_id: uuid.UUID, kind: PhotoKind) -> Sequence[Photo]:
        """All photos of one kind (e.g. the current avatar)."""
        result = await self._session.execute(
            select(Photo).where(Photo.user_id == user_id, Photo.kind == kind)
        )
        return result.scalars().all()

    async def expired_meals(self, user_id: uuid.UUID, before: date) -> Sequence[Photo]:
        """Meal photos of days before ``before``."""
        result = await self._session.execute(
            select(Photo).where(
                Photo.user_id == user_id, Photo.kind == PhotoKind.MEAL, Photo.day < before
            )
        )
        return result.scalars().all()

    async def between(
        self, user_id: uuid.UUID, kind: PhotoKind | None, start: date, end: date
    ) -> Sequence[Photo]:
        """Photos from ``start`` to ``end`` inclusive, newest first."""
        query = select(Photo).where(Photo.user_id == user_id, Photo.day >= start, Photo.day <= end)
        if kind is not None:
            query = query.where(Photo.kind == kind)
        result = await self._session.execute(query.order_by(Photo.created_at.desc(), Photo.id))
        return result.scalars().all()

    async def all_of(self, user_id: uuid.UUID) -> Sequence[Photo]:
        """Every photo record of a user, oldest first (for the data export)."""
        result = await self._session.execute(
            select(Photo)
            .where(Photo.user_id == user_id)
            .order_by(Photo.day, Photo.created_at, Photo.id)
        )
        return result.scalars().all()

    async def erase(self, user_id: uuid.UUID) -> None:
        """Delete every photo record of a user."""
        await self._session.execute(delete(Photo).where(Photo.user_id == user_id))
