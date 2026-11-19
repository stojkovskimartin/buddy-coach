"""Rules for direct account connections, free of frameworks."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

from buddy_coach.core.errors import DomainError

SYNC_INTERVAL = timedelta(minutes=10)
"""Withings asks for at most one poll per user every 10 minutes."""
FIRST_SYNC = timedelta(days=365)
"""The first sync brings in the last year."""
REFRESH_MARGIN = timedelta(minutes=5)
FUTURE_TOLERANCE = timedelta(hours=1)
MAX_PAGES = 50
"""Bounds one sync; the cursor is only saved after the last page, so nothing is lost."""

WITHINGS_WEIGHT = 1
WITHINGS_AMBIGUOUS = 1
"""``attrib`` of a weigh-in the scale could not assign to one person (a guest on the scale)."""


class Provider(StrEnum):
    """Accounts that can be connected directly."""

    WITHINGS = "withings"


class ProviderError(DomainError):
    """The provider failed or answered with an error; trying again later may work."""

    status_code = 502
    code = "provider_error"
    title = "The connected service did not answer as expected"


class ReconnectRequiredError(DomainError):
    """The provider no longer accepts the connection (revoked, expired or changed password)."""

    status_code = 409
    code = "reconnect_required"
    title = "Connect the account again"


@dataclass(frozen=True, slots=True)
class Reading:
    """One weigh-in from the provider."""

    external_id: str
    measured_at: datetime
    weight_kg: float


@dataclass(frozen=True, slots=True)
class MeasurePage:
    """One page of measurements and where to continue."""

    readings: list[Reading]
    update_time: int | None
    more: bool
    offset: int


def parse_withings_measures(body: dict[str, Any], now: datetime) -> MeasurePage:
    """Weights in kg from a Withings ``getmeas`` body. Guests on the scale and readings dated in
    the future (a wrong scale clock) are left out, so they never block a sync."""
    readings: list[Reading] = []
    for group in body.get("measuregrps") or []:
        if group.get("attrib") == WITHINGS_AMBIGUOUS:
            continue
        measured_at = datetime.fromtimestamp(int(group["date"]), UTC)
        if measured_at > now + FUTURE_TOLERANCE:
            continue
        for measure in group.get("measures") or []:
            if measure.get("type") == WITHINGS_WEIGHT:
                kg = int(measure["value"]) * 10.0 ** int(measure["unit"])
                readings.append(Reading(str(group["grpid"]), measured_at, round(kg, 2)))
    update_time = body.get("updatetime")
    return MeasurePage(
        readings=readings,
        update_time=int(update_time) if update_time is not None else None,
        more=bool(body.get("more")),
        offset=int(body.get("offset") or 0),
    )
