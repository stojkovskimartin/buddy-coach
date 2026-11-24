"""Daily check-in use cases."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.checkin.domain import (
    BASELINE_DAYS,
    CheckinValues,
    readiness_for,
    validate_day,
    validate_range,
)
from buddy_coach.checkin.events import CheckinSaved
from buddy_coach.checkin.models import DailyCheckin
from buddy_coach.checkin.repository import CheckinRepository
from buddy_coach.checkin.schemas import CheckinIn, CheckinOut, CheckinRecord, ReadinessOut
from buddy_coach.core.clock import local_date
from buddy_coach.core.deps import Clock
from buddy_coach.core.errors import NotFoundError
from buddy_coach.core.events import EventBus


class TimezoneLookup(Protocol):
    """What the check-in module needs from the profile module."""

    async def timezone_for(self, user_id: uuid.UUID) -> str | None: ...


def _values(checkin: DailyCheckin) -> CheckinValues:
    return CheckinValues(
        sleep_quality=checkin.sleep_quality,
        soreness=checkin.soreness,
        mood=checkin.mood,
        sleep_hours=checkin.sleep_hours,
        hrv_ms=checkin.hrv_ms,
        resting_hr=checkin.resting_hr,
        pain=checkin.pain,
    )


class CheckinService:
    """Save check-ins and compute readiness. Commits its own transactions."""

    def __init__(
        self,
        session: AsyncSession,
        events: EventBus,
        profiles: TimezoneLookup,
        now: Clock,
    ) -> None:
        self._session = session
        self._repo = CheckinRepository(session)
        self._events = events
        self._profiles = profiles
        self._now = now

    async def local_today(self, user_id: uuid.UUID) -> date:
        """Today in the athlete's time zone (UTC until the profile exists)."""
        return local_date(self._now(), await self._profiles.timezone_for(user_id))

    async def save(self, user_id: uuid.UUID, day: date, data: CheckinIn) -> tuple[CheckinOut, bool]:
        """Create or replace the check-in of a day; True when it was created."""
        validate_day(day, await self.local_today(user_id))
        checkin, created = await self._repo.upsert(user_id, day, data.model_dump())
        out = await self._with_readiness(user_id, checkin)
        await self._session.commit()
        await self._events.publish(CheckinSaved(user_id=user_id, day=day))
        return out, created

    async def get(self, user_id: uuid.UUID, day: date) -> CheckinOut:
        """The check-in of a day with its readiness."""
        checkin = await self._repo.get(user_id, day)
        if checkin is None:
            raise NotFoundError("No check-in for this day yet.")
        return await self._with_readiness(user_id, checkin)

    async def history(self, user_id: uuid.UUID, start: date, end: date) -> list[CheckinOut]:
        """Check-ins in a date range, newest first, each with its readiness."""
        validate_range(start, end)
        rows = await self._repo.between(user_id, start - timedelta(days=BASELINE_DAYS), end)
        return [self._out(row, rows) for row in rows if row.day >= start]

    async def export_user(self, user_id: uuid.UUID) -> list[CheckinRecord]:
        """Every check-in of the user, for the data export."""
        return [CheckinRecord.model_validate(row) for row in await self._repo.all_of(user_id)]

    async def erase_user(self, user_id: uuid.UUID) -> None:
        """Delete every check-in of the user. Joins the caller's transaction (no commit)."""
        await self._repo.erase(user_id)

    async def _with_readiness(self, user_id: uuid.UUID, checkin: DailyCheckin) -> CheckinOut:
        previous = await self._repo.between(
            user_id, checkin.day - timedelta(days=BASELINE_DAYS), checkin.day - timedelta(days=1)
        )
        return self._out(checkin, previous)

    @staticmethod
    def _out(checkin: DailyCheckin, others: Sequence[DailyCheckin]) -> CheckinOut:
        """``others`` may hold any days; the domain picks the baseline window."""
        result = readiness_for(checkin.day, _values(checkin), [(o.day, _values(o)) for o in others])
        return CheckinOut(
            day=checkin.day,
            sleep_quality=checkin.sleep_quality,
            soreness=checkin.soreness,
            mood=checkin.mood,
            sleep_hours=checkin.sleep_hours,
            hrv_ms=checkin.hrv_ms,
            resting_hr=checkin.resting_hr,
            pain=checkin.pain,
            readiness=ReadinessOut(
                score=result.score,
                level=result.level,
                limiting_factors=list(result.limiting_factors),
            ),
        )
