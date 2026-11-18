from __future__ import annotations

from datetime import date, timedelta

import pytest

from buddy_coach.science.nutrition import (
    BodyData,
    DailyIntake,
    EnergyGoal,
    Lifestyle,
    WeightEntry,
    adaptive_maintenance_kcal,
    bmr_mifflin_st_jeor,
    daily_targets,
    maintenance_kcal,
    session_carbs_g_per_hour,
    weight_trend_kg_per_day,
)

MARTIN = BodyData(weight_kg=79, height_cm=182, age_years=28, sex="male")
SMALL_WOMAN = BodyData(weight_kg=50, height_cm=155, age_years=40, sex="female")


def test_bmr_matches_mifflin_st_jeor_by_hand() -> None:
    # 10*79 + 6.25*182 - 5*28 + 5 = 1792.5
    assert bmr_mifflin_st_jeor(MARTIN) == pytest.approx(1792.5)
    # 10*50 + 6.25*155 - 5*40 - 161 = 1107.75
    assert bmr_mifflin_st_jeor(SMALL_WOMAN) == pytest.approx(1107.75)


def test_body_data_validation() -> None:
    with pytest.raises(ValueError, match="sex"):
        BodyData(weight_kg=70, height_cm=170, age_years=30, sex="x")
    with pytest.raises(ValueError, match="positive"):
        BodyData(weight_kg=0, height_cm=170, age_years=30, sex="male")


def test_maintenance_discounts_watch_energy() -> None:
    rest = maintenance_kcal(MARTIN, Lifestyle.SEDENTARY, 0)
    with_training = maintenance_kcal(MARTIN, Lifestyle.SEDENTARY, 800)
    assert rest == pytest.approx(1792.5 * 1.2)
    assert with_training - rest == pytest.approx(600)


def test_negative_training_energy_is_rejected() -> None:
    with pytest.raises(ValueError, match="negative"):
        maintenance_kcal(MARTIN, Lifestyle.LIGHT, -1)


def test_maintain_targets_sum_to_energy() -> None:
    targets = daily_targets(MARTIN, Lifestyle.LIGHT, EnergyGoal.MAINTAIN, training_kcal=500)
    macro_kcal = targets.protein_g * 4 + targets.carbs_g * 4 + targets.fat_g * 9
    assert abs(macro_kcal - targets.kcal) <= 10  # rounding
    assert targets.kcal == targets.maintenance_kcal
    assert targets.protein_g == round(1.6 * 79)


def test_default_loss_rate_is_half_percent_per_week() -> None:
    maintain = daily_targets(MARTIN, Lifestyle.LIGHT, EnergyGoal.MAINTAIN)
    lose = daily_targets(MARTIN, Lifestyle.LIGHT, EnergyGoal.LOSE)
    expected_deficit = 79 * 0.005 * 7700 / 7
    assert maintain.kcal - lose.kcal == pytest.approx(expected_deficit, abs=1)
    assert lose.protein_g == round(2.0 * 79)


def test_aggressive_loss_rate_is_capped() -> None:
    capped = daily_targets(MARTIN, Lifestyle.ACTIVE, EnergyGoal.LOSE, rate_pct_per_week=3)
    at_cap = daily_targets(MARTIN, Lifestyle.ACTIVE, EnergyGoal.LOSE, rate_pct_per_week=1)
    assert capped.kcal == at_cap.kcal
    assert any("capped" in r for r in capped.reasons)


def test_gain_adds_surplus() -> None:
    maintain = daily_targets(MARTIN, Lifestyle.LIGHT, EnergyGoal.MAINTAIN)
    gain = daily_targets(MARTIN, Lifestyle.LIGHT, EnergyGoal.GAIN, rate_pct_per_week=0.5)
    assert gain.kcal - maintain.kcal == pytest.approx(79 * 0.005 * 7700 / 7, abs=1)


def test_floor_protects_small_sedentary_people() -> None:
    targets = daily_targets(SMALL_WOMAN, Lifestyle.SEDENTARY, EnergyGoal.LOSE, rate_pct_per_week=1)
    assert targets.floor_applied
    assert targets.kcal >= 1200
    assert targets.kcal >= round(bmr_mifflin_st_jeor(SMALL_WOMAN))
    assert targets.carbs_g >= 0
    assert targets.fat_g >= round(0.6 * 50)


def test_measured_maintenance_overrides_formula() -> None:
    targets = daily_targets(
        MARTIN, Lifestyle.LIGHT, EnergyGoal.MAINTAIN, maintenance_override_kcal=3100
    )
    assert targets.kcal == 3100
    assert any("measured" in r for r in targets.reasons)


def test_non_positive_rate_is_rejected() -> None:
    with pytest.raises(ValueError, match="positive"):
        daily_targets(MARTIN, Lifestyle.LIGHT, EnergyGoal.LOSE, rate_pct_per_week=0)


def _days(n: int) -> list[date]:
    start = date(2026, 1, 1)
    return [start + timedelta(days=i) for i in range(n)]


def test_weight_trend_slope() -> None:
    weights = [WeightEntry(d, 80 - 0.05 * i) for i, d in enumerate(_days(21))]
    assert weight_trend_kg_per_day(weights) == pytest.approx(-0.05)


def test_weight_trend_needs_spread() -> None:
    with pytest.raises(ValueError, match="at least two"):
        weight_trend_kg_per_day([WeightEntry(date(2026, 1, 1), 80)])
    with pytest.raises(ValueError, match="more than one day"):
        weight_trend_kg_per_day([WeightEntry(date(2026, 1, 1), 80)] * 2)


def test_adaptive_maintenance_from_stable_weight_equals_intake() -> None:
    days = _days(21)
    intakes = [DailyIntake(d, 2600) for d in days]
    weights = [WeightEntry(d, 79.0 + (0.3 if i % 2 else -0.3)) for i, d in enumerate(days)]
    estimate = adaptive_maintenance_kcal(intakes, weights)
    assert estimate is not None
    assert estimate == pytest.approx(2600, abs=60)


def test_adaptive_maintenance_with_weight_loss() -> None:
    days = _days(28)
    intakes = [DailyIntake(d, 2200) for d in days]
    weights = [WeightEntry(d, 80 - 0.05 * i) for i, d in enumerate(days)]
    estimate = adaptive_maintenance_kcal(intakes, weights)
    assert estimate == pytest.approx(2200 + 0.05 * 7700)


def test_adaptive_maintenance_needs_enough_data() -> None:
    days = _days(10)
    assert (
        adaptive_maintenance_kcal(
            [DailyIntake(d, 2500) for d in days], [WeightEntry(d, 80) for d in days]
        )
        is None
    )


def test_implausible_adaptive_result_is_discarded() -> None:
    days = _days(21)
    intakes = [DailyIntake(d, 300) for d in days]  # clearly incomplete logging
    weights = [WeightEntry(d, 80.0) for d in days[:-1]] + [WeightEntry(days[-1], 80.1)]
    assert adaptive_maintenance_kcal(intakes, weights) is None


@pytest.mark.parametrize(("minutes", "grams"), [(30, 0), (59, 0), (60, 45), (150, 45), (240, 75)])
def test_session_carbs(minutes: int, grams: int) -> None:
    assert session_carbs_g_per_hour(minutes) == grams


def test_session_carbs_rejects_negative() -> None:
    with pytest.raises(ValueError, match="negative"):
        session_carbs_g_per_hour(-5)
