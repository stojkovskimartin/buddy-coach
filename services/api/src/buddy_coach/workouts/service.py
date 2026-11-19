"""Workout use cases: import from any source, feedback, and training load."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.clock import local_date
from buddy_coach.core.deps import Clock
from buddy_coach.core.errors import NotFoundError, ValidationFailedError
from buddy_coach.core.events import EventBus
from buddy_coach.profile.domain import AthleteSnapshot, ExperienceLevel, age_on
from buddy_coach.workouts.domain import (
    HISTORY_DAYS_FOR_FITNESS,
    LOW_INTENSITY_ACTIVITIES,
    WorkoutSource,
    load_summary,
    session_load,
    validate_range,
)
from buddy_coach.workouts.events import WorkoutsChanged
from buddy_coach.workouts.models import Workout
from buddy_coach.workouts.repository import WorkoutRepository
from buddy_coach.workouts.schemas import (
    DayLoadOut,
    FeedbackIn,
    ImportedWorkout,
    ImportResult,
    LoadOut,
    RampOut,
    WorkoutData,
    WorkoutSourceOut,
)

FUTURE_TOLERANCE = timedelta(hours=1)
"""Clocks drift a little; anything further ahead is a wrong date."""

_DEVICE_FIELDS = (
    "activity",
    "started_at",
    "duration_min",
    "distance_km",
    "elevation_gain_m",
    "avg_hr",
    "max_hr",
    "kcal",
)


class AthleteLookup(Protocol):
    """What the workouts module needs from the profile module."""

    async def athlete_snapshot(self, user_id: uuid.UUID) -> AthleteSnapshot | None: ...


class WorkoutService:
    """Commits its own transactions; publishes WorkoutsChanged after each change."""

    def __init__(
        self, session: AsyncSession, events: EventBus, athletes: AthleteLookup, now: Clock
    ) -> None:
        self._session = session
        self._repo = WorkoutRepository(session)
        self._events = events
        self._athletes = athletes
        self._now = now

    async def import_workouts(
        self, user_id: uuid.UUID, workouts: Sequence[ImportedWorkout]
    ) -> ImportResult:
        """Create or update workouts by (source, external_id); feedback the athlete gave stays."""
        athlete = await self._athletes.athlete_snapshot(user_id)
        latest = {(w.source, w.external_id): w for w in workouts}  # last one wins in a batch
        for data in latest.values():
            self._refuse_future(data)
        await self._repo.lock_user(user_id)
        existing = await self._repo.by_source_ids(user_id, list(latest))
        created = 0
        first_day: date | None = None
        for key, data in latest.items():
            workout = existing.get(key)
            if workout is None:
                workout = Workout(
                    user_id=user_id, source=data.source, external_id=data.external_id, pain=False
                )
                self._repo.add(workout)
                created += 1
                self._apply(workout, data, athlete, keep_feedback=False)
            else:
                first_day = min(first_day or workout.day, workout.day)
                self._apply(workout, data, athlete, keep_feedback=True)
            first_day = min(first_day or workout.day, workout.day)
        await self._session.commit()
        if first_day is not None:
            await self._events.publish(WorkoutsChanged(user_id=user_id, first_day=first_day))
        return ImportResult(created=created, updated=len(latest) - created)

    async def log_workout(self, user_id: uuid.UUID, data: WorkoutData) -> Workout:
        """A session typed in by the athlete."""
        self._refuse_future(data)
        workout = Workout(
            user_id=user_id,
            source=WorkoutSource.MANUAL,
            external_id=str(uuid.uuid4()),
            pain=False,
        )
        self._apply(
            workout, data, await self._athletes.athlete_snapshot(user_id), keep_feedback=False
        )
        self._repo.add(workout)
        await self._session.commit()
        await self._events.publish(WorkoutsChanged(user_id=user_id, first_day=workout.day))
        return workout

    async def give_feedback(
        self, user_id: uuid.UUID, workout_id: uuid.UUID, feedback: FeedbackIn
    ) -> Workout:
        """Effort, feeling and pain after a session; the load is recomputed from the new RPE."""
        workout = await self._get(user_id, workout_id)
        changes = feedback.model_dump(exclude_unset=True)
        for name, value in changes.items():
            if name == "pain":
                workout.pain = bool(value)
            else:
                setattr(workout, name, value)
        self._compute_load(workout, await self._athletes.athlete_snapshot(user_id))
        await self._session.commit()
        await self._events.publish(WorkoutsChanged(user_id=user_id, first_day=workout.day))
        return workout

    async def delete(self, user_id: uuid.UUID, workout_id: uuid.UUID) -> None:
        """Remove a workout (e.g. a duplicate recorded by two devices)."""
        workout = await self._get(user_id, workout_id)
        day = workout.day
        await self._repo.remove(workout)
        await self._session.commit()
        await self._events.publish(WorkoutsChanged(user_id=user_id, first_day=day))

    async def history(self, user_id: uuid.UUID, start: date, end: date) -> Sequence[Workout]:
        """Workouts in a date range, newest first."""
        validate_range(start, end)
        return await self._repo.between(user_id, start, end)

    async def sources(self, user_id: uuid.UUID) -> list[WorkoutSourceOut]:
        """Where the athlete's workouts come from, latest first (the connections overview)."""
        return [
            WorkoutSourceOut(source=s, workouts=n, last_at=last)
            for s, n, last in await self._repo.sources(user_id)
        ]

    async def today(self, user_id: uuid.UUID) -> date:
        """Today in the athlete's time zone."""
        athlete = await self._athletes.athlete_snapshot(user_id)
        return local_date(self._now(), athlete.timezone if athlete else None)

    async def load(self, user_id: uuid.UUID, days: int) -> LoadOut:
        """Fitness, fatigue, form and the weekly ramp, computed from all stored workouts."""
        athlete = await self._athletes.athlete_snapshot(user_id)
        today = local_date(self._now(), athlete.timezone if athlete else None)
        loads = await self._repo.daily_loads(
            user_id,
            today - timedelta(days=days + HISTORY_DAYS_FOR_FITNESS),
            today,
            exclude=LOW_INTENSITY_ACTIVITIES,
        )
        experience = athlete.experience if athlete else ExperienceLevel.BEGINNER
        summary = load_summary(loads, today, days, experience.value)
        series = [
            DayLoadOut(
                day=s.day,
                load=round(s.load, 1),
                fitness=round(s.fitness, 1),
                fatigue=round(s.fatigue, 1),
                form=round(s.form, 1),
            )
            for s in summary.days
        ]
        ratio = summary.acute_chronic_ratio
        return LoadOut(
            today=series[-1],
            acute_chronic_ratio=round(ratio, 2) if ratio is not None else None,
            ramp=RampOut(
                last_week_load=summary.last_week_load,
                this_week_load=summary.this_week_load,
                max_allowed_load=summary.ramp.max_allowed_load,
                verdict=summary.ramp.verdict,
            ),
            days=series,
            excluded_activities=sorted(a.value for a in LOW_INTENSITY_ACTIVITIES),
        )

    async def _get(self, user_id: uuid.UUID, workout_id: uuid.UUID) -> Workout:
        workout = await self._repo.get(user_id, workout_id)
        if workout is None:
            raise NotFoundError("Workout not found.")
        return workout

    def _refuse_future(self, data: WorkoutData) -> None:
        """A wrong device clock must not put load into days that have not happened."""
        if data.started_at > self._now() + FUTURE_TOLERANCE:
            raise ValidationFailedError("A workout cannot start in the future.")

    def _apply(
        self,
        workout: Workout,
        data: WorkoutData,
        athlete: AthleteSnapshot | None,
        *,
        keep_feedback: bool,
    ) -> None:
        """Device fields are replaced. On a re-sync the athlete's own rating stays: a device's RPE
        only fills an empty one, and reported pain is never cleared by a device."""
        for name in _DEVICE_FIELDS:
            setattr(workout, name, getattr(data, name))
        if data.rpe is not None and not (keep_feedback and workout.rpe is not None):
            workout.rpe = data.rpe
        if data.feeling is not None and not (keep_feedback and workout.feeling is not None):
            workout.feeling = data.feeling
        if data.pain is not None and not (keep_feedback and workout.pain):
            workout.pain = data.pain
        workout.day = local_date(data.started_at, athlete.timezone if athlete else None)
        self._compute_load(workout, athlete)

    def _compute_load(self, workout: Workout, athlete: AthleteSnapshot | None) -> None:
        age = age_on(athlete.birth_year, workout.day) if athlete else None
        result = session_load(
            workout.activity,
            workout.duration_min,
            rpe=workout.rpe,
            avg_hr=workout.avg_hr,
            age_years=age,
            max_hr=workout.max_hr,
        )
        workout.load = result.load
        workout.load_source = result.source
