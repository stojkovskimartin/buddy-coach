from __future__ import annotations

import pytest

from buddy_coach.science.micronutrients import (
    REFERENCE_INTAKE,
    UNITS,
    IntakeStatus,
    Nutrient,
    assess_intake,
    reference_for,
)
from buddy_coach.science.nutrition import BodyData, Sex
from buddy_coach.science.recovery import (
    SessionIntensity,
    post_session_recovery,
    protein_distribution,
)
from buddy_coach.science.supplements import (
    CATALOGUE,
    DOPING_NOTE,
    OUT_OF_SCOPE,
    Evidence,
    HealthFlag,
    Purpose,
    get_supplement,
    supplement_advice,
)

MARTIN = BodyData(weight_kg=79, height_cm=182, age_years=28, sex=Sex.MALE)
LIGHT = BodyData(weight_kg=50, height_cm=160, age_years=30, sex=Sex.FEMALE)


# --- micronutrients -------------------------------------------------------------------------


def test_every_nutrient_has_reference_unit_and_sources() -> None:
    for nutrient in Nutrient:
        assert set(REFERENCE_INTAKE[nutrient]) == {Sex.MALE, Sex.FEMALE}
        assert UNITS[nutrient]


def test_sex_specific_references() -> None:
    assert reference_for(Nutrient.IRON, Sex.FEMALE) > reference_for(Nutrient.IRON, Sex.MALE)
    assert reference_for(Nutrient.ZINC, Sex.MALE) > reference_for(Nutrient.ZINC, Sex.FEMALE)


def _day(**values: float) -> dict[Nutrient, float]:
    return {Nutrient(k): v for k, v in values.items()}


def test_assessment_needs_several_days() -> None:
    assert assess_intake([_day(iron=10)] * 2, Sex.MALE) == []


def test_low_ok_and_above_upper_limit() -> None:
    days = [_day(iron=5, calcium=1100, vitamin_d=150)] * 3
    result = {a.nutrient: a for a in assess_intake(days, Sex.MALE)}
    assert result[Nutrient.IRON].status is IntakeStatus.LOW
    assert result[Nutrient.IRON].food_sources
    assert result[Nutrient.CALCIUM].status is IntakeStatus.OK
    assert result[Nutrient.CALCIUM].food_sources == ()
    assert result[Nutrient.VITAMIN_D].status is IntakeStatus.ABOVE_UPPER_LIMIT


def test_assessment_averages_days() -> None:
    days = [_day(fibre=10), _day(fibre=30), _day(fibre=50)]
    fibre = next(a for a in assess_intake(days, Sex.FEMALE) if a.nutrient is Nutrient.FIBRE)
    assert fibre.average_intake == 30
    assert fibre.percent_of_reference == 100


@pytest.mark.parametrize("bad", [-1.0, float("nan"), float("inf")])
def test_assessment_rejects_bad_values(bad: float) -> None:
    with pytest.raises(ValueError, match="finite"):
        assess_intake([_day(iron=bad)] * 3, Sex.MALE)


# --- recovery -------------------------------------------------------------------------------


def test_protein_distribution_scales_with_reference_weight() -> None:
    dist = protein_distribution(MARTIN, meals=4)
    assert dist.protein_per_meal_g == round(0.3 * 79)
    assert dist.daily_total_g == dist.protein_per_meal_g * 4


def test_protein_per_meal_is_bounded() -> None:
    assert protein_distribution(LIGHT).protein_per_meal_g == 20
    heavy = BodyData(weight_kg=180, height_cm=210, age_years=30, sex=Sex.MALE)
    assert protein_distribution(heavy).protein_per_meal_g == 33  # BMI-25 reference weight
    assert protein_distribution(heavy).protein_per_meal_g <= 40


@pytest.mark.parametrize("meals", [2, 7])
def test_protein_distribution_rejects_odd_meal_counts(meals: int) -> None:
    with pytest.raises(ValueError, match="meals"):
        protein_distribution(MARTIN, meals)


def test_quick_turnaround_needs_fast_refuelling() -> None:
    meal = post_session_recovery(MARTIN, 90, SessionIntensity.HARD, hours_until_next_session=6)
    assert meal.carbs_g == round(1.2 * 79)
    assert meal.protein_g > 0
    assert "soon" in meal.reason


def test_easy_session_needs_no_recovery_meal() -> None:
    meal = post_session_recovery(MARTIN, 40, SessionIntensity.EASY)
    assert (meal.carbs_g, meal.protein_g) == (0, 0)


def test_long_session_counts_as_hard() -> None:
    meal = post_session_recovery(MARTIN, 120, SessionIntensity.MODERATE)
    assert meal.carbs_g == 79


def test_fluid_replacement_from_sweat_loss() -> None:
    meal = post_session_recovery(MARTIN, 60, SessionIntensity.MODERATE, body_mass_lost_kg=1.0)
    assert meal.fluid_ml == 1500


@pytest.mark.parametrize(("duration", "lost"), [(0, None), (float("nan"), None), (60, 9.0)])
def test_recovery_rejects_bad_input(duration: float, lost: float | None) -> None:
    with pytest.raises(ValueError):  # noqa: PT011
        post_session_recovery(MARTIN, duration, SessionIntensity.EASY, body_mass_lost_kg=lost)


# --- supplements ----------------------------------------------------------------------------


def test_catalogue_keys_are_unique_and_complete() -> None:
    keys = [s.key for s in CATALOGUE]
    assert len(keys) == len(set(keys))
    for item in CATALOGUE:
        assert item.purposes
        assert item.typical_use
        assert item.max_daily


def test_out_of_scope_substances_are_not_in_catalogue() -> None:
    assert not OUT_OF_SCOPE & {s.key for s in CATALOGUE}
    assert get_supplement("melatonin") is None
    assert get_supplement(" Creatine ") is not None


def test_strength_advice_suggests_creatine_first() -> None:
    advice = supplement_advice(frozenset({Purpose.STRENGTH_POWER}))
    assert advice.suggested[0].evidence is Evidence.A
    assert "creatine" in {s.key for s in advice.suggested}
    assert DOPING_NOTE in advice.notes


def test_kidney_disease_moves_creatine_to_professional() -> None:
    advice = supplement_advice(
        frozenset({Purpose.STRENGTH_POWER}), frozenset({HealthFlag.KIDNEY_DISEASE})
    )
    assert "creatine" not in {s.key for s in advice.suggested}
    assert "creatine" in {s.key for s in advice.ask_a_professional}
    assert len(advice.notes) == 2


def test_iron_and_vitamin_d_always_need_a_professional() -> None:
    advice = supplement_advice(frozenset({Purpose.GENERAL_HEALTH, Purpose.ENDURANCE}))
    professional = {s.key for s in advice.ask_a_professional}
    assert {"iron", "vitamin_d"} <= professional
    assert not {"iron", "vitamin_d"} & {s.key for s in advice.suggested}


def test_weak_evidence_is_hidden_by_default() -> None:
    advice = supplement_advice(frozenset({Purpose.RECOVERY}))
    assert all(s.evidence is not Evidence.C for s in advice.suggested)
    lenient = supplement_advice(frozenset({Purpose.RECOVERY}), min_evidence=Evidence.C)
    assert any(s.evidence is Evidence.C for s in lenient.suggested)


def test_heart_condition_excludes_caffeine() -> None:
    advice = supplement_advice(
        frozenset({Purpose.ENDURANCE}), frozenset({HealthFlag.HEART_CONDITION})
    )
    assert "caffeine" not in {s.key for s in advice.suggested}
