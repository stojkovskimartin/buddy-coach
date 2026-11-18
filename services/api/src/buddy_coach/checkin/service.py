"""Daily check-in use cases."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

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
from buddy_coach.checkin.schemas import CheckinIn, CheckinOut, ReadinessOut
from buddy_coach.core.errors import NotFoundError
from buddy_coach.core.events import EventBus
from buddy_coach.profile.service import ProfileService


def _now() -> datetime:
    return datetime.now(UTC)


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
        profiles: ProfileService,
        now: Callable[[], datetime] = _now,
    ) -> None:
        self._session = session
        self._repo = CheckinRepository(session)
        self._events = events
        self._profiles = profiles
        self._now = now

    async def local_today(self, user_id: uuid.UUID) -> date:
        """Today in the athlete's time zone (UTC until the profile exists)."""
        profile = await self._profiles.find_profile(user_id)
        zone = ZoneInfo(profile.timezone) if profile else UTC
        return self._now().astimezone(zone).date()

    async def save(self, user_id: uuid.UUID, day: date, data: CheckinIn) -> CheckinOut:
        """Create or replace the check-in of a day."""
        validate_day(day, await self.local_today(user_id))
        checkin = await self._repo.upsert(user_id, day, data.model_dump())
        out = await self._with_readiness(user_id, checkin)
        await self._session.commit()
        await self._events.publish(CheckinSaved(user_id=user_id, day=day))
        return out

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
        return [self._out(row, rows[i + 1 :]) for i, row in enumerate(rows) if row.day >= start]

    async def _with_readiness(self, user_id: uuid.UUID, checkin: DailyCheckin) -> CheckinOut:
        previous = await self._repo.between(
            user_id, checkin.day - timedelta(days=BASELINE_DAYS), checkin.day - timedelta(days=1)
        )
        return self._out(checkin, previous)

    @staticmethod
    def _out(checkin: DailyCheckin, previous: Sequence[DailyCheckin]) -> CheckinOut:
        """``previous`` is newest first; only the days within the baseline window count."""
        window = [p for p in previous if (checkin.day - p.day).days <= BASELINE_DAYS]
        result = readiness_for(_values(checkin), [_values(p) for p in window])
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
