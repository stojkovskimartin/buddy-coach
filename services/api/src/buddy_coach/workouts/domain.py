"""Rules for workouts and training load, free of frameworks.

Every workout gets one load in session-RPE units (minutes x effort 1-10), whatever its source, so
a run from Garmin, a ride from Strava and a gym session typed in by hand add up on one scale.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.science.training import (
    DEFAULT_REST_HR,
    FitnessState,
    RampCheck,
    acute_chronic_ratio,
    check_weekly_ramp,
    fitness_series,
    max_hr_tanaka,
    rpe_from_heart_rate,
    srpe_load,
)


class WorkoutSource(StrEnum):
    """Where a workout came from. Phone hubs collect most watches and apps."""

    MANUAL = "manual"
    FIT_FILE = "fit_file"
    APPLE_HEALTH = "apple_health"  # iPhone: Apple Watch, Garmin, WHOOP, Oura, ...
    HEALTH_CONNECT = "health_connect"  # Android: Fitbit, Samsung, Xiaomi/Zepp, Garmin, ...
    GARMIN = "garmin"
    FITBIT = "fitbit"
    WHOOP = "whoop"
    POLAR = "polar"
    SUUNTO = "suunto"
    COROS = "coros"
    HUAWEI = "huawei"
    XIAOMI = "xiaomi"
    STRAVA = "strava"


class ActivityType(StrEnum):
    """Activity of a workout (devices' many types are mapped onto these)."""

    RUNNING = "running"
    TRAIL_RUNNING = "trail_running"
    CYCLING = "cycling"
    INDOOR_CYCLING = "indoor_cycling"
    SWIMMING = "swimming"
    WALKING = "walking"
    HIKING = "hiking"
    SKI_TOURING = "ski_touring"
    CROSS_COUNTRY_SKIING = "cross_country_skiing"
    ALPINE_SKIING = "alpine_skiing"
    ROWING = "rowing"
    STRENGTH = "strength"
    HIIT = "hiit"
    CLIMBING = "climbing"
    YOGA = "yoga"
    TEAM_SPORT = "team_sport"
    OTHER = "other"


class LoadSource(StrEnum):
    """How a workout's effort was known: the athlete's own rating beats any estimate."""

    RPE = "rpe"
    HEART_RATE = "heart_rate"
    TYPICAL = "typical"


TYPICAL_RPE: dict[ActivityType, float] = {
    ActivityType.WALKING: 2,
    ActivityType.YOGA: 2,
    ActivityType.ALPINE_SKIING: 3,
    ActivityType.HIKING: 4,
    ActivityType.INDOOR_CYCLING: 5,
    ActivityType.STRENGTH: 5,
    ActivityType.CLIMBING: 5,
    ActivityType.TEAM_SPORT: 6,
    ActivityType.HIIT: 7,
}
"""Effort assumed when neither an RPE nor heart rate is known; anything else counts as 4."""
DEFAULT_TYPICAL_RPE = 4.0

MAX_IMPORT_BATCH = 500
MAX_RANGE_DAYS = 366
HISTORY_DAYS_FOR_FITNESS = 120
"""Fitness (42-day average) needs history before the window shown, or it starts at zero."""


@dataclass(frozen=True, slots=True)
class SessionLoad:
    """A workout's load and the effort it was computed from."""

    load: float
    rpe: float
    source: LoadSource


def session_load(
    activity: ActivityType,
    duration_min: float,
    *,
    rpe: float | None,
    avg_hr: float | None,
    age_years: int | None,
    rest_hr: float | None = None,
) -> SessionLoad:
    """Load of one session: the athlete's RPE, else heart rate, else the typical effort."""
    if rpe is not None:
        effort, source = rpe, LoadSource.RPE
    elif avg_hr is not None and age_years is not None:
        effort = rpe_from_heart_rate(avg_hr, rest_hr or DEFAULT_REST_HR, max_hr_tanaka(age_years))
        source = LoadSource.HEART_RATE
    else:
        effort, source = TYPICAL_RPE.get(activity, DEFAULT_TYPICAL_RPE), LoadSource.TYPICAL
    return SessionLoad(
        load=round(srpe_load(duration_min, effort), 1), rpe=round(effort, 1), source=source
    )


def validate_range(start: date, end: date) -> None:
    """History queries are bounded."""
    if end < start:
        raise ValidationFailedError(f"The range ends ({end}) before it starts ({start}).")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationFailedError(f"At most {MAX_RANGE_DAYS} days per request.")


@dataclass(frozen=True, slots=True)
class LoadSummary:
    """Fitness, fatigue and form per day, today's ratio and the weekly ramp check."""

    days: list[FitnessState]
    acute_chronic_ratio: float | None
    last_week_load: float
    this_week_load: float
    ramp: RampCheck


def load_summary(
    daily_loads: dict[date, float], today: date, days: int, experience: str
) -> LoadSummary:
    """Summary of the last ``days`` days, with enough history before them for fitness."""
    start = today - timedelta(days=days - 1)
    series = fitness_series(daily_loads, start - timedelta(days=HISTORY_DAYS_FOR_FITNESS), today)
    shown = [s for s in series if s.day >= start]
    this_week = sum(daily_loads.get(today - timedelta(days=n), 0.0) for n in range(7))
    last_week = sum(daily_loads.get(today - timedelta(days=n), 0.0) for n in range(7, 14))
    return LoadSummary(
        days=shown,
        acute_chronic_ratio=acute_chronic_ratio(series[-1]),
        last_week_load=round(last_week, 1),
        this_week_load=round(this_week, 1),
        ramp=check_weekly_ramp(last_week, this_week, experience),
    )
