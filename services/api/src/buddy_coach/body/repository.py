"""Persistence for body weights."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import delete, select, text, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.body.domain import WeightSource
from buddy_coach.body.models import BodyWeight


class BodyWeightRepository:
    """Data access for body weights. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def lock_user(self, user_id: uuid.UUID) -> None:
        """Serialise weight writes of one user until the transaction ends, so concurrent syncs
        neither insert the same measurement twice nor disagree on which one is the latest."""
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"body_weights:{user_id}"},
        )

    async def by_source_ids(
        self, user_id: uuid.UUID, keys: Sequence[tuple[WeightSource, str]]
    ) -> dict[tuple[WeightSource, str], BodyWeight]:
        """Existing measurements of a user for (source, external_id) keys."""
        if not keys:
            return {}
        result = await self._session.execute(
            select(BodyWeight).where(
                BodyWeight.user_id == user_id,
                tuple_(BodyWeight.source, BodyWeight.external_id).in_(list(keys)),
            )
        )
        return {(w.source, w.external_id): w for w in result.scalars()}

    def add(self, weight: BodyWeight) -> None:
        """Stage a new measurement."""
        self._session.add(weight)

    async def get(self, user_id: uuid.UUID, weight_id: uuid.UUID) -> BodyWeight | None:
        """A measurement, only if it belongs to the user."""
        result = await self._session.execute(
            select(BodyWeight).where(BodyWeight.id == weight_id, BodyWeight.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def remove(self, weight: BodyWeight) -> None:
        """Delete a measurement."""
        await self._session.execute(delete(BodyWeight).where(BodyWeight.id == weight.id))

    async def latest(self, user_id: uuid.UUID) -> BodyWeight | None:
        """The most recent measurement."""
        result = await self._session.execute(
            select(BodyWeight)
            .where(BodyWeight.user_id == user_id)
            .order_by(BodyWeight.measured_at.desc(), BodyWeight.created_at.desc(), BodyWeight.id)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def between(self, user_id: uuid.UUID, start: date, end: date) -> Sequence[BodyWeight]:
        """Measurements from ``start`` to ``end`` inclusive, newest first."""
        result = await self._session.execute(
            select(BodyWeight)
            .where(BodyWeight.user_id == user_id, BodyWeight.day >= start, BodyWeight.day <= end)
            .order_by(BodyWeight.measured_at.desc(), BodyWeight.created_at.desc(), BodyWeight.id)
        )
        return result.scalars().all()
