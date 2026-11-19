from __future__ import annotations

from datetime import date

import pytest

from buddy_coach.nutrition.domain import energy_goal, targets_for
from buddy_coach.profile.domain import AthleteSnapshot, GoalType, Sex
from buddy_coach.science.nutrition import EnergyGoal

TODAY = date(2026, 11, 19)


def _athlete(goal: GoalType | None) -> AthleteSnapshot:
    return AthleteSnapshot(
        birth_year=1998,
        sex=Sex.MALE,
        height_cm=182,
        weight_kg=79,
        timezone="Europe/Zurich",
        primary_goal=goal,
    )


@pytest.mark.parametrize(
    ("goal", "expected"),
    [
        (GoalType.LOSE_WEIGHT, EnergyGoal.LOSE),
        (GoalType.GAIN_WEIGHT, EnergyGoal.GAIN),
        (GoalType.ENDURANCE_EVENT, EnergyGoal.MAINTAIN),
        (None, EnergyGoal.MAINTAIN),
    ],
)
def test_goal_sets_the_energy_direction(goal: GoalType | None, expected: EnergyGoal) -> None:
    assert energy_goal(goal) is expected


def test_losing_weight_eats_below_maintenance_and_keeps_protein_high() -> None:
    _, maintain = targets_for(_athlete(None), TODAY)
    goal, lose = targets_for(_athlete(GoalType.LOSE_WEIGHT), TODAY)
    assert goal is EnergyGoal.LOSE
    assert lose.kcal < maintain.kcal == maintain.maintenance_kcal
    assert lose.protein_g > maintain.protein_g


def test_macros_add_up_to_the_calories() -> None:
    _, t = targets_for(_athlete(GoalType.GAIN_WEIGHT), TODAY)
    assert abs(t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9 - t.kcal) <= 15
