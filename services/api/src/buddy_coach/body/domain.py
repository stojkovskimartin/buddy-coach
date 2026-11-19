"""Rules for body-weight measurements, free of frameworks."""

from __future__ import annotations

from datetime import date
from enum import StrEnum

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.profile.domain import MAX_WEIGHT_KG, MIN_WEIGHT_KG

MAX_IMPORT_BATCH = 500
MAX_RANGE_DAYS = 366


class WeightSource(StrEnum):
    """Where a measurement came from. Smart scales (Withings, Xiaomi, Garmin, Eufy, Renpho, ...)
    write to the phone's health store, which the app reads; a Withings account can also be
    connected directly."""

    MANUAL = "manual"
    APPLE_HEALTH = "apple_health"
    HEALTH_CONNECT = "health_connect"
    WITHINGS = "withings"


PHONE_SOURCES = frozenset({WeightSource.APPLE_HEALTH, WeightSource.HEALTH_CONNECT})


def is_plausible(weight_kg: float) -> bool:
    """An adult's weight; anything else (a child or a bag on a shared scale) is not stored."""
    return MIN_WEIGHT_KG <= weight_kg <= MAX_WEIGHT_KG


def validate_range(start: date, end: date) -> None:
    """History queries are bounded."""
    if end < start:
        raise ValidationFailedError(f"The range ends ({end}) before it starts ({start}).")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationFailedError(f"At most {MAX_RANGE_DAYS} days per request.")
