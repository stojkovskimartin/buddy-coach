from __future__ import annotations

from datetime import date, timedelta

import pytest

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.science.training import RampVerdict, max_hr_tanaka, rpe_from_heart_rate
from buddy_coach.workouts.domain import (
    MAX_RANGE_DAYS,
    ActivityType,
    LoadSource,
    load_summary,
    session_load,
    validate_range,
)

TODAY = date(2026, 11, 19)


def test_athletes_rpe_wins() -> None:
    result = session_load(ActivityType.RUNNING, 60, rpe=7, avg_hr=150, age_years=28)
    assert (result.load, result.rpe, result.source) == (420, 7, LoadSource.RPE)


def test_heart_rate_estimates_effort_when_no_rpe() -> None:
    # 28 years: max 188.4; rest 60; 160 bpm = 78 % reserve -> RPE ~5.8
    result = session_load(ActivityType.CYCLING, 60, rpe=None, avg_hr=160, age_years=28)
    assert result.source is LoadSource.HEART_RATE
    assert result.rpe == pytest.approx(5.8, abs=0.1)
    assert result.load == pytest.approx(60 * result.rpe, abs=1)


@pytest.mark.parametrize(
    ("activity", "rpe"),
    [(ActivityType.WALKING, 2), (ActivityType.HIIT, 7), (ActivityType.ROWING, 4)],
)
def test_typical_effort_when_nothing_is_known(activity: ActivityType, rpe: float) -> None:
    result = session_load(activity, 30, rpe=None, avg_hr=None, age_years=None)
    assert (result.rpe, result.source, result.load) == (rpe, LoadSource.TYPICAL, 30 * rpe)


def test_heart_rate_needs_an_age() -> None:
    result = session_load(ActivityType.RUNNING, 30, rpe=None, avg_hr=150, age_years=None)
    assert result.source is LoadSource.TYPICAL


@pytest.mark.parametrize(("avg_hr", "rpe"), [(50, 1), (124, 3.0), (188, 8.0), (230, 8.0)])
def test_rpe_from_heart_rate_is_bounded(avg_hr: float, rpe: float) -> None:
    assert rpe_from_heart_rate(avg_hr, 60, max_hr_tanaka(28)) == pytest.approx(rpe, abs=0.1)


def test_max_hr_and_rpe_reject_nonsense() -> None:
    with pytest.raises(ValueError, match="age"):
        max_hr_tanaka(5)
    with pytest.raises(ValueError, match="rest_hr"):
        rpe_from_heart_rate(150, 190, 180)


def test_range_rules() -> None:
    validate_range(TODAY - timedelta(days=MAX_RANGE_DAYS - 1), TODAY)
    with pytest.raises(ValidationFailedError):
        validate_range(TODAY, TODAY - timedelta(days=1))
    with pytest.raises(ValidationFailedError):
        validate_range(TODAY - timedelta(days=MAX_RANGE_DAYS), TODAY)


def test_load_summary_builds_fitness_from_history_and_flags_steep_weeks() -> None:
    steady = {TODAY - timedelta(days=n): 300.0 for n in range(14, 100)}
    last_week = {TODAY - timedelta(days=n): 300.0 for n in range(7, 14)}
    this_week = {TODAY - timedelta(days=n): 600.0 for n in range(7)}
    summary = load_summary({**steady, **last_week, **this_week}, TODAY, 28, "intermediate")

    assert len(summary.days) == 28
    assert summary.days[-1].day == TODAY
    assert summary.days[0].fitness > 200  # history before the window counts
    assert (summary.last_week_load, summary.this_week_load) == (2100, 4200)
    assert summary.ramp.verdict is RampVerdict.TOO_STEEP
    assert summary.acute_chronic_ratio is not None
    assert summary.acute_chronic_ratio > 1.3


def test_load_summary_without_training() -> None:
    summary = load_summary({}, TODAY, 7, "beginner")
    assert summary.acute_chronic_ratio is None
    assert summary.ramp.verdict is RampVerdict.OK
    assert all(d.load == 0 for d in summary.days)
