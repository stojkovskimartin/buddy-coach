"""Calendar days in the athlete's time zone."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo


def local_date(now: datetime, timezone: str | None) -> date:
    """The calendar day ``now`` falls on in ``timezone`` (UTC when unknown: before onboarding)."""
    return now.astimezone(ZoneInfo(timezone) if timezone else UTC).date()
