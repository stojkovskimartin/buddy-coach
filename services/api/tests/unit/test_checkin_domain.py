from __future__ import annotations

from datetime import date, timedelta

import pytest

from buddy_coach.checkin.domain import (
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


def test_good_morning_is_green() -> None:
    result = readiness_for(GOOD, [])
    assert result.level is ReadinessLevel.GREEN
    assert result.score == 100


def test_pain_always_means_red() -> None:
    result = readiness_for(CheckinValues(sleep_quality=5, soreness=5, mood=5, pain=True), [])
    assert result.level is ReadinessLevel.RED


def test_resting_hr_needs_three_earlier_values() -> None:
    high_rhr = CheckinValues(sleep_quality=5, soreness=5, mood=5, resting_hr=70)
    assert readiness_for(high_rhr, [CheckinValues(5, 5, 5, resting_hr=50)] * 2).score == 100
    result = readiness_for(high_rhr, [CheckinValues(5, 5, 5, resting_hr=50)] * 3)
    assert "resting_hr" in result.limiting_factors


def test_hrv_needs_seven_earlier_values() -> None:
    low_hrv = CheckinValues(sleep_quality=5, soreness=5, mood=5, hrv_ms=35)
    assert readiness_for(low_hrv, [CheckinValues(5, 5, 5, hrv_ms=70)] * 6).score == 100
    seven = [CheckinValues(5, 5, 5, hrv_ms=v) for v in (68, 70, 72, 69, 71, 70, 73)]
    assert "hrv" in readiness_for(low_hrv, seven).limiting_factors


def test_only_the_seven_most_recent_values_form_the_baseline() -> None:
    today = CheckinValues(sleep_quality=5, soreness=5, mood=5, resting_hr=50)
    recent = [CheckinValues(5, 5, 5, resting_hr=50)] * 7
    older_low = [CheckinValues(5, 5, 5, resting_hr=40)] * 5
    assert readiness_for(today, recent + older_low).score == readiness_for(today, recent).score
