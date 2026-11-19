"""Persistence for workouts."""

from __future__ import annotations

import uuid
from collections.abc import Collection, Sequence
from datetime import date

from sqlalchemy import delete, func, select, text, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.workouts.domain import ActivityType, WorkoutSource
from buddy_coach.workouts.models import Workout


class WorkoutRepository:
    """Data access for workouts. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def lock_user(self, user_id: uuid.UUID) -> None:
        """Serialise imports of one user until the transaction ends.

        Row locks cannot cover workouts that do not exist yet: without this, two syncs of the
        same new workout would both insert and one would fail on the unique constraint.
        """
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"workouts_import:{user_id}"},
        )

    async def by_source_ids(
        self, user_id: uuid.UUID, keys: Sequence[tuple[WorkoutSource, str]]
    ) -> dict[tuple[WorkoutSource, str], Workout]:
        """Existing workouts of a user for (source, external_id) keys, locked for update."""
        if not keys:
            return {}
        result = await self._session.execute(
            select(Workout)
            .where(
                Workout.user_id == user_id,
                tuple_(Workout.source, Workout.external_id).in_(list(keys)),
            )
            .with_for_update()
        )
        return {(w.source, w.external_id): w for w in result.scalars()}

    def add(self, workout: Workout) -> None:
        """Stage a new workout."""
        self._session.add(workout)

    async def get(self, user_id: uuid.UUID, workout_id: uuid.UUID) -> Workout | None:
        """A workout, only if it belongs to the user."""
        result = await self._session.execute(
            select(Workout).where(Workout.id == workout_id, Workout.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def remove(self, workout: Workout) -> None:
        """Delete a workout."""
        await self._session.execute(delete(Workout).where(Workout.id == workout.id))

    async def between(self, user_id: uuid.UUID, start: date, end: date) -> Sequence[Workout]:
        """Workouts from ``start`` to ``end`` inclusive, newest first."""
        result = await self._session.execute(
            select(Workout)
            .where(Workout.user_id == user_id, Workout.day >= start, Workout.day <= end)
            .order_by(Workout.started_at.desc())
        )
        return result.scalars().all()

    async def daily_loads(
        self,
        user_id: uuid.UUID,
        start: date,
        end: date,
        *,
        exclude: Collection[ActivityType] = (),
    ) -> dict[date, float]:
        """Sum of loads per day, computed in the database, leaving out ``exclude``."""
        query = select(Workout.day, func.sum(Workout.load)).where(
            Workout.user_id == user_id, Workout.day >= start, Workout.day <= end
        )
        if exclude:
            query = query.where(Workout.activity.not_in(list(exclude)))
        result = await self._session.execute(query.group_by(Workout.day))
        return {day: float(total) for day, total in result.all()}
