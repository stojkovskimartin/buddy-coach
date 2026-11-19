"""Body-weight use cases: manual entries, smart-scale sync and the trend."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.body.domain import WeightSource, is_plausible, validate_range
from buddy_coach.body.events import BodyWeightChanged
from buddy_coach.body.models import BodyWeight
from buddy_coach.body.repository import BodyWeightRepository
from buddy_coach.body.schemas import (
    ImportedWeight,
    TrendPoint,
    WeightHistoryOut,
    WeightImportResult,
    WeightIn,
    WeightOut,
)
from buddy_coach.core.clock import local_date
from buddy_coach.core.deps import Clock
from buddy_coach.core.errors import NotFoundError, ValidationFailedError
from buddy_coach.core.events import EventBus
from buddy_coach.science.nutrition import TREND_WINDOW_DAYS, WeightEntry, weight_trend

FUTURE_TOLERANCE = timedelta(hours=1)
"""Clocks drift a little; anything further ahead is a wrong date."""


class ProfileWeight(Protocol):
    """What the body module needs from the profile module."""

    async def timezone_for(self, user_id: uuid.UUID) -> str | None: ...

    async def set_current_weight(self, user_id: uuid.UUID, weight_kg: float) -> None: ...


class BodyService:
    """Commits its own transactions. Every write keeps the profile's weight equal to the latest
    measurement, in the same transaction, so targets and the coach always use it."""

    def __init__(
        self, session: AsyncSession, events: EventBus, profiles: ProfileWeight, now: Clock
    ) -> None:
        self._session = session
        self._repo = BodyWeightRepository(session)
        self._events = events
        self._profiles = profiles
        self._now = now

    async def log_weight(self, user_id: uuid.UUID, data: WeightIn) -> BodyWeight:
        """A weight typed in by the athlete (now, unless a time is given)."""
        measured_at = data.measured_at or self._now()
        self._refuse_future(measured_at)
        weight = BodyWeight(
            user_id=user_id,
            source=WeightSource.MANUAL,
            external_id=str(uuid.uuid4()),
            measured_at=measured_at,
            day=local_date(measured_at, await self._profiles.timezone_for(user_id)),
            weight_kg=data.weight_kg,
        )
        await self._repo.lock_user(user_id)
        self._repo.add(weight)
        await self._finish(user_id, weight.day)
        return weight

    async def import_weights(
        self, user_id: uuid.UUID, weights: Sequence[ImportedWeight]
    ) -> WeightImportResult:
        """Create or update measurements by (source, external_id). Implausible readings are
        skipped (a stored one keeps its value), so one odd reading on a shared scale never blocks
        the sync; a reading dated in the future fails the batch (a wrong phone clock)."""
        latest = {(w.source, w.external_id): w for w in weights}  # last one wins in a batch
        for data in latest.values():
            self._refuse_future(data.measured_at)
        plausible = {k: w for k, w in latest.items() if is_plausible(w.weight_kg)}
        timezone = await self._profiles.timezone_for(user_id)
        await self._repo.lock_user(user_id)
        existing = await self._repo.by_source_ids(user_id, list(plausible))
        created = 0
        first_day: date | None = None
        for key, data in plausible.items():
            weight = existing.get(key)
            if weight is None:
                weight = BodyWeight(
                    user_id=user_id, source=data.source, external_id=data.external_id
                )
                self._repo.add(weight)
                created += 1
            else:
                first_day = min(first_day or weight.day, weight.day)
            weight.measured_at = data.measured_at
            weight.day = local_date(data.measured_at, timezone)
            weight.weight_kg = data.weight_kg
            first_day = min(first_day or weight.day, weight.day)
        if first_day is None:
            return WeightImportResult(created=0, updated=0, skipped=len(latest))
        await self._finish(user_id, first_day)
        return WeightImportResult(
            created=created,
            updated=len(plausible) - created,
            skipped=len(latest) - len(plausible),
        )

    async def delete(self, user_id: uuid.UUID, weight_id: uuid.UUID) -> None:
        """Remove a measurement (e.g. someone else on the scale). The profile keeps the weight
        of the newest one left; with none left it keeps its last value."""
        await self._repo.lock_user(user_id)
        weight = await self._repo.get(user_id, weight_id)
        if weight is None:
            raise NotFoundError("Weight not found.")
        day = weight.day
        await self._repo.remove(weight)
        await self._finish(user_id, day)

    async def history(self, user_id: uuid.UUID, start: date, end: date) -> WeightHistoryOut:
        """Measurements in a range and the trend; earlier days fill the first trend windows."""
        validate_range(start, end)
        rows = await self._repo.between(user_id, start - timedelta(days=TREND_WINDOW_DAYS - 1), end)
        morning: dict[date, float] = {}
        for row in reversed(rows):  # oldest first: the first of each day is the morning one
            morning.setdefault(row.day, row.weight_kg)
        trend = weight_trend([WeightEntry(day=d, weight_kg=kg) for d, kg in morning.items()])
        return WeightHistoryOut(
            weights=[WeightOut.model_validate(r) for r in rows if r.day >= start],
            trend=[
                TrendPoint(day=t.day, weight_kg=round(t.weight_kg, 2))
                for t in trend
                if t.day >= start
            ],
        )

    async def today(self, user_id: uuid.UUID) -> date:
        """Today in the athlete's time zone."""
        return local_date(self._now(), await self._profiles.timezone_for(user_id))

    def _refuse_future(self, measured_at: datetime) -> None:
        if measured_at > self._now() + FUTURE_TOLERANCE:
            raise ValidationFailedError("A weight cannot be measured in the future.")

    async def _finish(self, user_id: uuid.UUID, first_day: date) -> None:
        """Copy the latest measurement to the profile, commit, then announce the change."""
        await self._session.flush()
        latest = await self._repo.latest(user_id)
        if latest is not None:
            await self._profiles.set_current_weight(user_id, latest.weight_kg)
        await self._session.commit()
        await self._events.publish(BodyWeightChanged(user_id=user_id, first_day=first_day))
