from __future__ import annotations

import math
from datetime import date, timedelta

import pytest

from buddy_coach.science.training import (
    RampVerdict,
    ReadinessInputs,
    ReadinessLevel,
    acute_chronic_ratio,
    check_weekly_ramp,
    fitness_series,
    readiness,
    srpe_load,
    trimp_banister,
)

START = date(2026, 1, 1)


def test_srpe_load() -> None:
    assert srpe_load(60, 7) == 420


@pytest.mark.parametrize(("minutes", "rpe"), [(-1, 5), (30, 0), (30, 11)])
def test_srpe_load_rejects_bad_input(minutes: float, rpe: float) -> None:
    with pytest.raises(ValueError):  # noqa: PT011
        srpe_load(minutes, rpe)


def test_trimp_matches_formula() -> None:
    reserve = (150 - 50) / (190 - 50)
    expected = 60 * reserve * 0.64 * math.exp(1.92 * reserve)
    assert trimp_banister(60, 150, 50, 190, "male") == pytest.approx(expected)


def test_trimp_female_coefficients_differ() -> None:
    assert trimp_banister(60, 150, 50, 190, "female") != trimp_banister(60, 150, 50, 190, "male")


def test_trimp_clamps_heart_rate_reserve() -> None:
    assert trimp_banister(60, 40, 50, 190, "male") == 0
    assert trimp_banister(60, 250, 50, 190, "male") == trimp_banister(60, 190, 50, 190, "male")


def test_trimp_rejects_bad_heart_rates() -> None:
    with pytest.raises(ValueError, match="rest_hr"):
        trimp_banister(60, 150, 190, 180, "male")


def test_constant_load_converges_to_that_load() -> None:
    loads = {START + timedelta(days=i): 100.0 for i in range(400)}
    last = fitness_series(loads, START, START + timedelta(days=399))[-1]
    assert last.fitness == pytest.approx(100, rel=1e-3)
    assert last.fatigue == pytest.approx(100, rel=1e-6)
    assert last.form == pytest.approx(0, abs=0.2)


def test_first_day_values() -> None:
    first = fitness_series({START: 84.0}, START, START)[0]
    assert first.fitness == pytest.approx(84 / 42)
    assert first.fatigue == pytest.approx(84 / 7)
    assert first.form == 0


def test_rest_days_raise_form_after_hard_block() -> None:
    loads = {START + timedelta(days=i): 150.0 for i in range(21)}
    series = fitness_series(loads, START, START + timedelta(days=30))
    assert series[20].form < 0  # tired at the end of the block
    assert series[30].form > series[21].form  # fresher after rest


def test_series_rejects_reversed_range() -> None:
    with pytest.raises(ValueError, match="before start"):
        fitness_series({}, START, START - timedelta(days=1))


def test_acute_chronic_ratio() -> None:
    series = fitness_series({START: 100.0}, START, START)
    ratio = acute_chronic_ratio(series[0])
    assert ratio == pytest.approx(6.0)
    empty = fitness_series({}, START, START)[0]
    assert acute_chronic_ratio(empty) is None


def test_weekly_ramp_limits() -> None:
    assert check_weekly_ramp(1000, 1100, "beginner").verdict is RampVerdict.OK
    steep = check_weekly_ramp(1000, 1200, "beginner")
    assert steep.verdict is RampVerdict.TOO_STEEP
    assert steep.max_allowed_load == 1100
    assert check_weekly_ramp(1000, 1150, "advanced").verdict is RampVerdict.OK


def test_ramp_after_break_allows_restart() -> None:
    assert check_weekly_ramp(0, 300, "intermediate").verdict is RampVerdict.OK


def test_ramp_rejects_negative() -> None:
    with pytest.raises(ValueError, match="negative"):
        check_weekly_ramp(-1, 100, "beginner")


def test_readiness_great_morning_is_green() -> None:
    result = readiness(
        ReadinessInputs(
            sleep_quality=5,
            soreness=5,
            mood=5,
            hrv_ms=70,
            hrv_baseline=[60, 62, 58, 61, 59, 63, 60],
            resting_hr=48,
            resting_hr_baseline=50,
            form=5,
        )
    )
    assert result.level is ReadinessLevel.GREEN
    assert result.score >= 90
    assert result.limiting_factors == ()


def test_readiness_bad_signals_are_named() -> None:
    result = readiness(
        ReadinessInputs(
            sleep_quality=1,
            soreness=2,
            mood=3,
            hrv_ms=45,
            hrv_baseline=[60, 62, 58, 61, 59, 63, 60],
        )
    )
    assert result.level is ReadinessLevel.RED
    assert "sleep" in result.limiting_factors
    assert "hrv" in result.limiting_factors


def test_readiness_without_devices_uses_self_report() -> None:
    result = readiness(ReadinessInputs(sleep_quality=4, soreness=4, mood=4))
    assert result.score == 75
    assert result.level is ReadinessLevel.GREEN


def test_pain_caps_readiness_at_red() -> None:
    result = readiness(ReadinessInputs(sleep_quality=5, soreness=5, mood=5, pain_reported=True))
    assert result.level is ReadinessLevel.RED
    assert result.limiting_factors[0] == "pain"


def test_short_hrv_baseline_is_ignored() -> None:
    with_short = readiness(
        ReadinessInputs(sleep_quality=3, soreness=3, mood=3, hrv_ms=10, hrv_baseline=[60, 61])
    )
    without = readiness(ReadinessInputs(sleep_quality=3, soreness=3, mood=3))
    assert with_short.score == without.score


def test_readiness_rejects_out_of_range_inputs() -> None:
    with pytest.raises(ValueError, match="sleep_quality"):
        readiness(ReadinessInputs(sleep_quality=0, soreness=3, mood=3))
