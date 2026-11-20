"""Stand-in for Withings and WHOOP: connect and sync without keys or internet (development only).

The consent page is skipped: ``authorize_url`` sends the browser straight back to the callback
page, which posts the code and the signed ``state`` as usual. Data is deterministic per day and
identified by the day, so syncing again updates the same records instead of adding new ones.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from buddy_coach.body.domain import WeightSource
from buddy_coach.body.schemas import ImportedWeight
from buddy_coach.integrations.clients import Pulled, Tokens
from buddy_coach.integrations.domain import Provider, ProviderError
from buddy_coach.workouts.domain import ActivityType, WorkoutSource
from buddy_coach.workouts.schemas import ImportedWorkout

FAKE_CODE = "fake"
FAKE_ACCESS = "fake-access"
FAKE_REFRESH = "fake-refresh"
TOKEN_TTL = timedelta(hours=1)
HISTORY = timedelta(days=30)
"""The first sync brings in the last 30 days."""
WEIGH_IN = time(6, 30, tzinfo=UTC)
WORKOUT = time(17, 0, tzinfo=UTC)


class FakeClient:
    """A ProviderClient that answers like the real one, without network calls."""

    def __init__(self, provider: Provider, redirect_url: str) -> None:
        self._provider = provider
        self._redirect_url = redirect_url

    def authorize_url(self, state: str) -> str:
        """The web app's callback page itself, as if the athlete had agreed."""
        parts = urlsplit(self._redirect_url)
        query = [*parse_qsl(parts.query), ("code", FAKE_CODE), ("state", state)]
        return urlunsplit(parts._replace(query=urlencode(query)))

    async def exchange(self, code: str, now: datetime) -> Tokens:
        """Fixed tokens for the code ``authorize_url`` hands out."""
        if code != FAKE_CODE:
            raise ProviderError("The fake provider only accepts its own code.")
        return self._tokens(now)

    async def refresh(self, refresh_token: str, now: datetime) -> Tokens:
        """The same fixed tokens, valid for another hour."""
        return self._tokens(now)

    async def pull(self, access_token: str, now: datetime, cursor: int | None) -> Pulled:
        """Every day since the last sync (that day included), up to ``now``."""
        start = (
            (now - HISTORY).date() if cursor is None else datetime.fromtimestamp(cursor, UTC).date()
        )
        days = [start + timedelta(days=i) for i in range((now.date() - start).days + 1)]
        next_cursor = int(now.timestamp())
        if self._provider is Provider.WITHINGS:
            weights = [w for d in days if (w := _weight(d)).measured_at <= now]
            return Pulled(cursor=next_cursor, weights=weights)
        workouts = [s for d in days if (s := _workout(d)) and s.started_at <= now]
        return Pulled(cursor=next_cursor, workouts=workouts)

    @staticmethod
    def _tokens(now: datetime) -> Tokens:
        return Tokens(FAKE_ACCESS, FAKE_REFRESH, now + TOKEN_TTL)


def _weight(day: date) -> ImportedWeight:
    return ImportedWeight(
        source=WeightSource.WITHINGS,
        external_id=f"fake-{day.isoformat()}",
        measured_at=datetime.combine(day, WEIGH_IN),
        weight_kg=round(78 + 0.6 * math.sin(day.toordinal() / 5), 1),
    )


def _workout(day: date) -> ImportedWorkout | None:
    """A run or a ride every other day."""
    if day.toordinal() % 2:
        return None
    run = day.toordinal() % 4 == 0
    return ImportedWorkout(
        source=WorkoutSource.WHOOP,
        external_id=f"fake-{day.isoformat()}",
        activity=ActivityType.RUNNING if run else ActivityType.CYCLING,
        started_at=datetime.combine(day, WORKOUT),
        duration_min=45 if run else 60,
        distance_km=9.0 if run else 28.0,
        avg_hr=148 if run else 135,
        max_hr=172 if run else 160,
        kcal=520 if run else 610,
    )
