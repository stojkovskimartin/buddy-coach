from __future__ import annotations

from datetime import date, timedelta

import pytest

from buddy_coach.science.nutrition import (
    BodyData,
    DailyIntake,
    EnergyGoal,
    Lifestyle,
    Sex,
    WeightEntry,
    adaptive_maintenance_kcal,
    bmr_mifflin_st_jeor,
    daily_targets,
    maintenance_kcal,
    session_carbs_g_per_hour,
    weight_trend,
    weight_trend_kg_per_day,
)

MARTIN = BodyData(weight_kg=79, height_cm=182, age_years=28, sex=Sex.MALE)
SMALL_WOMAN = BodyData(weight_kg=50, height_cm=155, age_years=40, sex=Sex.FEMALE)


def test_bmr_matches_mifflin_st_jeor_by_hand() -> None:
    # 10*79 + 6.25*182 - 5*28 + 5 = 1792.5
    assert bmr_mifflin_st_jeor(MARTIN) == pytest.approx(1792.5)
    # 10*50 + 6.25*155 - 5*40 - 161 = 1107.75
    assert bmr_mifflin_st_jeor(SMALL_WOMAN) == pytest.approx(1107.75)


@pytest.mark.parametrize(
    ("weight", "height", "age", "message"),
    [
        (0, 170, 30, "weight_kg"),
        (float("nan"), 170, 30, "finite"),
        (70, float("inf"), 30, "finite"),
        (70, 170, 1, "age_years"),
        (500, 170, 30, "weight_kg"),
    ],
)
def test_body_data_validation(weight: float, height: float, age: int, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        BodyData(weight_kg=weight, height_cm=height, age_years=age, sex=Sex.MALE)


def test_body_data_requires_sex_enum() -> None:
    with pytest.raises(TypeError):
        BodyData(weight_kg=70, height_cm=170, age_years=30, sex="male")  # type: ignore[arg-type]


def test_maintenance_discounts_watch_energy() -> None:
    rest = maintenance_kcal(MARTIN, Lifestyle.SEDENTARY, 0)
    with_training = maintenance_kcal(MARTIN, Lifestyle.SEDENTARY, 800)
    assert rest == pytest.approx(1792.5 * 1.2)
    assert with_training - rest == pytest.approx(600)


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf"), 20_000])
def test_bad_training_energy_is_rejected(value: float) -> None:
    with pytest.raises(ValueError, match="training_kcal"):
        maintenance_kcal(MARTIN, Lifestyle.LIGHT, value)


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


def _macro_kcal(t: object) -> int:
    from buddy_coach.science.nutrition import NutritionTargets

    assert isinstance(t, NutritionTargets)
    return t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9


@pytest.mark.parametrize(
    "body",
    [
        BodyData(weight_kg=40, height_cm=150, age_years=25, sex=Sex.FEMALE),
        BodyData(weight_kg=200, height_cm=175, age_years=45, sex=Sex.MALE),
        BodyData(weight_kg=150, height_cm=170, age_years=60, sex=Sex.FEMALE),
        SMALL_WOMAN,
        MARTIN,
    ],
)
@pytest.mark.parametrize("goal", list(EnergyGoal))
def test_macros_always_add_up_and_stay_non_negative(body: BodyData, goal: EnergyGoal) -> None:
    rate = None if goal is EnergyGoal.MAINTAIN else 1.0
    t = daily_targets(body, Lifestyle.SEDENTARY, goal, rate_pct_per_week=rate)
    assert abs(_macro_kcal(t) - t.kcal) <= 10
    assert min(t.protein_g, t.carbs_g, t.fat_g) >= 0
    assert t.protein_g * 4 <= 0.35 * t.kcal + 4


def test_heavy_person_gets_protein_from_reference_weight() -> None:
    heavy = BodyData(weight_kg=150, height_cm=180, age_years=40, sex=Sex.MALE)
    t = daily_targets(heavy, Lifestyle.LIGHT, EnergyGoal.LOSE)
    assert heavy.reference_weight_kg == pytest.approx(25 * 1.8 * 1.8)
    assert t.protein_g <= round(2.0 * heavy.reference_weight_kg)
    assert t.carbs_g > 0


@pytest.mark.parametrize(("sex", "floor"), [(Sex.MALE, 1500), (Sex.FEMALE, 1200)])
def test_sex_specific_floors(sex: Sex, floor: int) -> None:
    tiny = BodyData(weight_kg=40, height_cm=150, age_years=80, sex=sex)
    t = daily_targets(tiny, Lifestyle.SEDENTARY, EnergyGoal.LOSE, rate_pct_per_week=1)
    assert t.floor_applied
    assert t.kcal >= floor


def test_rate_with_maintenance_is_rejected() -> None:
    with pytest.raises(ValueError, match="maintenance"):
        daily_targets(MARTIN, Lifestyle.LIGHT, EnergyGoal.MAINTAIN, rate_pct_per_week=0.5)


def test_non_finite_override_is_rejected_and_extreme_override_clamped() -> None:
    with pytest.raises(ValueError, match="finite"):
        daily_targets(
            MARTIN, Lifestyle.LIGHT, EnergyGoal.MAINTAIN, maintenance_override_kcal=float("nan")
        )
    clamped = daily_targets(
        MARTIN, Lifestyle.LIGHT, EnergyGoal.MAINTAIN, maintenance_override_kcal=50_000
    )
    assert clamped.maintenance_kcal == 6000


def test_adaptive_ignores_intake_outside_weight_window() -> None:
    days = _days(40)
    intakes = [DailyIntake(d, 2500) for d in days[:20]]  # logged before weighing started
    weights = [WeightEntry(d, 80.0) for d in days[20:]]
    assert adaptive_maintenance_kcal(intakes, weights) is None


def test_adaptive_requires_80_percent_coverage() -> None:
    days = _days(21)
    intakes = [DailyIntake(d, 2500) for d in days[::2]]  # every second day
    weights = [WeightEntry(d, 80.0) for d in days]
    assert adaptive_maintenance_kcal(intakes, weights) is None


def test_adaptive_is_limited_relative_to_formula() -> None:
    days = _days(28)
    intakes = [DailyIntake(d, 4000) for d in days]
    weights = [WeightEntry(d, 80.0) for d in days]
    assert adaptive_maintenance_kcal(intakes, weights, formula_estimate_kcal=2600) == pytest.approx(
        2600 * 1.25
    )


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
    weights = [WeightEntry(d, 80.0) for d in days]
    assert adaptive_maintenance_kcal(intakes, weights) is None


@pytest.mark.parametrize(("minutes", "grams"), [(30, 0), (59, 0), (60, 45), (150, 45), (240, 75)])
def test_session_carbs(minutes: int, grams: int) -> None:
    assert session_carbs_g_per_hour(minutes) == grams


def test_session_carbs_rejects_negative() -> None:
    with pytest.raises(ValueError, match="duration_min"):
        session_carbs_g_per_hour(-5)


def test_weight_trend_averages_the_measured_days_of_the_last_week() -> None:
    d = date(2026, 11, 1)
    daily = [
        WeightEntry(d + timedelta(days=offset), kg)
        for offset, kg in [(6, 79.0), (0, 80.0), (2, 81.0), (9, 77.0)]  # unordered, with gaps
    ]
    assert [(t.day.day, t.weight_kg) for t in weight_trend(daily)] == [
        (1, 80.0),
        (3, 80.5),
        (7, 80.0),
        (10, 78.0),  # the window 4-10 Nov holds 7 and 10 Nov
    ]
