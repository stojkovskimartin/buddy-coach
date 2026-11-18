"""``local_today``: the athlete's calendar day, from the profile time zone and a fixed clock."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import cast

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.checkin.service import CheckinService
from buddy_coach.core.events import InProcessEventBus

USER = uuid.uuid4()


class FakeProfiles:
    def __init__(self, timezone: str | None) -> None:
        self._timezone = timezone

    async def timezone_for(self, user_id: uuid.UUID) -> str | None:
        assert user_id == USER
        return self._timezone


def _service(timezone: str | None, now: datetime) -> CheckinService:
    session = cast(AsyncSession, object())  # local_today never touches the database
    return CheckinService(session, InProcessEventBus(), FakeProfiles(timezone), now=lambda: now)


@pytest.mark.parametrize(
    ("timezone", "now", "expected"),
    [
        # 23:30 UTC is already the next day in Zurich (UTC+1 in winter) ...
        ("Europe/Zurich", datetime(2026, 11, 18, 23, 30, tzinfo=UTC), date(2026, 11, 19)),
        # ... and still the previous day in New York.
        ("America/New_York", datetime(2026, 11, 19, 3, 0, tzinfo=UTC), date(2026, 11, 18)),
        # Summer time: Zurich is UTC+2, so 22:30 UTC is already the next day.
        ("Europe/Zurich", datetime(2026, 7, 1, 22, 30, tzinfo=UTC), date(2026, 7, 2)),
        # Before onboarding there is no time zone: UTC.
        (None, datetime(2026, 11, 18, 23, 30, tzinfo=UTC), date(2026, 11, 18)),
    ],
)
async def test_local_today(timezone: str | None, now: datetime, expected: date) -> None:
    assert await _service(timezone, now).local_today(USER) == expected
