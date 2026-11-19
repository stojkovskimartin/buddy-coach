"""Persistence for the food diary."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.meals.models import MealEntry


class MealRepository:
    """Data access for diary entries. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, entry: MealEntry) -> None:
        """Stage a new entry."""
        self._session.add(entry)

    async def get(self, user_id: uuid.UUID, entry_id: uuid.UUID) -> MealEntry | None:
        """An entry, only if it belongs to the user."""
        result = await self._session.execute(
            select(MealEntry).where(MealEntry.id == entry_id, MealEntry.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def remove(self, entry: MealEntry) -> None:
        """Delete an entry."""
        await self._session.execute(delete(MealEntry).where(MealEntry.id == entry.id))

    async def of_day(self, user_id: uuid.UUID, day: date) -> Sequence[MealEntry]:
        """Entries of one day in the order eaten."""
        result = await self._session.execute(
            select(MealEntry)
            .where(MealEntry.user_id == user_id, MealEntry.day == day)
            .order_by(MealEntry.eaten_at, MealEntry.created_at, MealEntry.id)
        )
        return result.scalars().all()

    async def daily_totals(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> list[tuple[date, float, float, float, float]]:
        """(day, kcal, protein, carbs, fat) per day with entries, summed in the database."""
        result = await self._session.execute(
            select(
                MealEntry.day,
                func.sum(MealEntry.kcal),
                func.sum(MealEntry.protein_g),
                func.sum(MealEntry.carbs_g),
                func.sum(MealEntry.fat_g),
            )
            .where(MealEntry.user_id == user_id, MealEntry.day >= start, MealEntry.day <= end)
            .group_by(MealEntry.day)
            .order_by(MealEntry.day)
        )
        return [(d, float(k), float(p), float(c), float(f)) for d, k, p, c, f in result.all()]
