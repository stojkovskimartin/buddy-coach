"""Food-diary use cases."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.clock import local_date
from buddy_coach.core.deps import Clock
from buddy_coach.core.errors import NotFoundError, ValidationFailedError
from buddy_coach.meals.domain import check_plausible, validate_range
from buddy_coach.meals.models import MealEntry
from buddy_coach.meals.repository import MealRepository
from buddy_coach.meals.schemas import (
    DailyTotalsOut,
    MealDayOut,
    MealEntryIn,
    MealEntryOut,
    NutrientTotals,
)

FUTURE_TOLERANCE = timedelta(hours=1)
"""Clocks drift a little; anything further ahead is a wrong date."""


class TimezoneLookup(Protocol):
    """What the meals module needs from the profile module."""

    async def timezone_for(self, user_id: uuid.UUID) -> str | None: ...


def _round(value: float) -> float:
    return round(value, 1)


class MealService:
    """Commits its own transactions."""

    def __init__(self, session: AsyncSession, profiles: TimezoneLookup, now: Clock) -> None:
        self._session = session
        self._repo = MealRepository(session)
        self._profiles = profiles
        self._now = now

    async def log(self, user_id: uuid.UUID, data: MealEntryIn) -> MealEntry:
        """Add a food to the diary (eaten now, unless a time is given)."""
        eaten_at = data.eaten_at or self._now()
        if eaten_at > self._now() + FUTURE_TOLERANCE:
            raise ValidationFailedError("A meal cannot be eaten in the future.")
        check_plausible(data.grams, data.kcal, data.protein_g, data.carbs_g, data.fat_g)
        entry = MealEntry(
            user_id=user_id,
            day=local_date(eaten_at, await self._profiles.timezone_for(user_id)),
            **data.model_dump(exclude={"eaten_at"}),
            eaten_at=eaten_at,
        )
        self._repo.add(entry)
        await self._session.commit()
        return entry

    async def delete(self, user_id: uuid.UUID, entry_id: uuid.UUID) -> None:
        """Remove an entry."""
        entry = await self._repo.get(user_id, entry_id)
        if entry is None:
            raise NotFoundError("Diary entry not found.")
        await self._repo.remove(entry)
        await self._session.commit()

    async def day(self, user_id: uuid.UUID, day: date) -> MealDayOut:
        """One day of the diary with its totals."""
        entries = await self._repo.of_day(user_id, day)
        return MealDayOut(
            day=day,
            entries=[MealEntryOut.model_validate(e) for e in entries],
            totals=NutrientTotals(
                kcal=_round(sum(e.kcal for e in entries)),
                protein_g=_round(sum(e.protein_g for e in entries)),
                carbs_g=_round(sum(e.carbs_g for e in entries)),
                fat_g=_round(sum(e.fat_g for e in entries)),
            ),
        )

    async def daily_totals(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> list[DailyTotalsOut]:
        """Totals of each day with entries, oldest first."""
        validate_range(start, end)
        return [
            DailyTotalsOut(
                day=d, kcal=_round(k), protein_g=_round(p), carbs_g=_round(c), fat_g=_round(f)
            )
            for d, k, p, c, f in await self._repo.daily_totals(user_id, start, end)
        ]

    async def today(self, user_id: uuid.UUID) -> date:
        """Today in the athlete's time zone."""
        return local_date(self._now(), await self._profiles.timezone_for(user_id))
