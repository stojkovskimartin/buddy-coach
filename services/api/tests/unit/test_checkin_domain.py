from __future__ import annotations

from datetime import date, timedelta

import pytest

from buddy_coach.checkin.domain import (
    BASELINE_DAYS,
    MAX_LATE_DAYS,
    MAX_RANGE_DAYS,
    CheckinValues,
    readiness_for,
    validate_day,
    validate_range,
)
from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.science.training import ReadinessLevel

TODAY = date(2026, 11, 18)
GOOD = CheckinValues(sleep_quality=5, soreness=5, mood=5)


@pytest.mark.parametrize("days_back", [0, 1, MAX_LATE_DAYS])
def test_today_and_recent_days_are_allowed(days_back: int) -> None:
    validate_day(TODAY - timedelta(days=days_back), TODAY)


@pytest.mark.parametrize(
    ("day", "message"),
    [(TODAY + timedelta(days=1), "future"), (TODAY - timedelta(days=MAX_LATE_DAYS + 1), "late")],
)
def test_future_and_too_old_days_are_refused(day: date, message: str) -> None:
    with pytest.raises(ValidationFailedError, match=message):
        validate_day(day, TODAY)


def test_range_must_be_ordered_and_bounded() -> None:
    validate_range(TODAY - timedelta(days=MAX_RANGE_DAYS - 1), TODAY)
    with pytest.raises(ValidationFailedError, match="before"):
        validate_range(TODAY, TODAY - timedelta(days=1))
    with pytest.raises(ValidationFailedError, match="At most"):
        validate_range(TODAY - timedelta(days=MAX_RANGE_DAYS), TODAY)


def _days(values: list[CheckinValues], start: int = 1) -> list[tuple[date, CheckinValues]]:
    """Pair values with the days before TODAY: start, start+1, ... days back."""
    return [(TODAY - timedelta(days=start + n), v) for n, v in enumerate(values)]


def test_good_morning_is_green() -> None:
    result = readiness_for(TODAY, GOOD, [])
    assert result.level is ReadinessLevel.GREEN
    assert result.score == 100


def test_pain_always_means_red() -> None:
    pain = CheckinValues(sleep_quality=5, soreness=5, mood=5, pain=True)
    assert readiness_for(TODAY, pain, []).level is ReadinessLevel.RED


def test_resting_hr_needs_three_earlier_values() -> None:
    high_rhr = CheckinValues(sleep_quality=5, soreness=5, mood=5, resting_hr=70)
    normal = CheckinValues(5, 5, 5, resting_hr=50)
    assert readiness_for(TODAY, high_rhr, _days([normal] * 2)).score == 100
    assert "resting_hr" in readiness_for(TODAY, high_rhr, _days([normal] * 3)).limiting_factors


def test_hrv_needs_seven_earlier_values() -> None:
    low_hrv = CheckinValues(sleep_quality=5, soreness=5, mood=5, hrv_ms=35)
    assert (
        readiness_for(TODAY, low_hrv, _days([CheckinValues(5, 5, 5, hrv_ms=70)] * 6)).score == 100
    )
    seven = [CheckinValues(5, 5, 5, hrv_ms=v) for v in (68, 70, 72, 69, 71, 70, 73)]
    assert "hrv" in readiness_for(TODAY, low_hrv, _days(seven)).limiting_factors


def test_only_the_seven_most_recent_values_form_the_baseline() -> None:
    today = CheckinValues(sleep_quality=5, soreness=5, mood=5, resting_hr=50)
    recent = _days([CheckinValues(5, 5, 5, resting_hr=50)] * 7)
    older_low = _days([CheckinValues(5, 5, 5, resting_hr=40)] * 5, start=8)
    assert (
        readiness_for(TODAY, today, older_low + recent).score
        == readiness_for(TODAY, today, recent).score
    )


@pytest.mark.parametrize(
    ("days_back", "counts"), [(BASELINE_DAYS, True), (BASELINE_DAYS + 1, False)]
)
def test_baseline_window_is_fourteen_days(days_back: int, counts: bool) -> None:
    high_rhr = CheckinValues(sleep_quality=5, soreness=5, mood=5, resting_hr=70)
    normal = CheckinValues(5, 5, 5, resting_hr=50)
    previous = [*_days([normal] * 2), (TODAY - timedelta(days=days_back), normal)]
    limited = "resting_hr" in readiness_for(TODAY, high_rhr, previous).limiting_factors
    assert limited is counts


def test_the_day_itself_and_later_days_are_not_part_of_the_baseline() -> None:
    high_rhr = CheckinValues(sleep_quality=5, soreness=5, mood=5, resting_hr=70)
    normal = CheckinValues(5, 5, 5, resting_hr=50)
    later = [(TODAY + timedelta(days=n), normal) for n in range(1, 4)]
    assert readiness_for(TODAY, high_rhr, [(TODAY, normal), *later]).score == 100
