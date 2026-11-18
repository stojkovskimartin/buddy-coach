"""Rules of the daily check-in, free of frameworks.

A check-in belongs to the athlete's local calendar day. It can be entered for today or, if
forgotten, for up to ``MAX_LATE_DAYS`` days back; never for the future.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import fmean

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.science.training import Readiness, ReadinessInputs, readiness

MAX_LATE_DAYS = 7
BASELINE_DAYS = 14
"""Device baselines look at most this many days back."""
BASELINE_VALUES = 7
"""The baseline is the seven most recent earlier values in that window."""
MIN_HRV_VALUES = 7
"""The HRV engine needs seven values for a stable spread (see science.training)."""
MIN_RESTING_HR_VALUES = 3
"""Resting heart rate is compared with an average, which three values already make useful."""
MAX_RANGE_DAYS = 92


@dataclass(frozen=True, slots=True)
class CheckinValues:
    """What the athlete reported for one day. Self-reports use 1 (bad) to 5 (great)."""

    sleep_quality: int
    soreness: int  # 1 = very sore, 5 = not sore at all
    mood: int
    sleep_hours: float | None = None
    hrv_ms: float | None = None
    resting_hr: float | None = None
    pain: bool = False


def validate_day(day: date, today: date) -> None:
    """A check-in is for today or a recent day, never for the future."""
    if day > today:
        raise ValidationFailedError("A check-in cannot be for a future day.")
    if day < today - timedelta(days=MAX_LATE_DAYS):
        raise ValidationFailedError(f"A check-in can be entered at most {MAX_LATE_DAYS} days late.")


def validate_range(start: date, end: date) -> None:
    """History queries are bounded so one request never loads years of data."""
    if end < start:
        raise ValidationFailedError("'to' must not be before 'from'.")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationFailedError(f"At most {MAX_RANGE_DAYS} days per request.")


def _baseline(values: Sequence[float | None], minimum: int) -> list[float]:
    present = [v for v in values if v is not None][:BASELINE_VALUES]
    return present if len(present) >= minimum else []


def readiness_for(today: CheckinValues, previous: Sequence[CheckinValues]) -> Readiness:
    """Today's readiness from the check-in and the previous days in the baseline window
    (newest first). HRV and resting heart rate only count when there is a baseline.
    """
    hrv_baseline = _baseline([c.hrv_ms for c in previous], MIN_HRV_VALUES)
    rhr_baseline = _baseline([c.resting_hr for c in previous], MIN_RESTING_HR_VALUES)
    return readiness(
        ReadinessInputs(
            sleep_quality=today.sleep_quality,
            soreness=today.soreness,
            mood=today.mood,
            hrv_ms=today.hrv_ms if hrv_baseline else None,
            hrv_baseline=tuple(hrv_baseline),
            resting_hr=today.resting_hr if rhr_baseline else None,
            resting_hr_baseline=fmean(rhr_baseline) if rhr_baseline else None,
            pain_reported=today.pain,
        )
    )
