"""Turns an athlete's profile and main goal into today's targets with the nutrition engine."""

from __future__ import annotations

from datetime import date

from buddy_coach.profile.domain import AthleteSnapshot, GoalType, age_on
from buddy_coach.science.nutrition import (
    BodyData,
    EnergyGoal,
    Lifestyle,
    NutritionTargets,
    Sex,
    daily_targets,
)

GOAL_TO_ENERGY: dict[GoalType | None, EnergyGoal] = {
    GoalType.LOSE_WEIGHT: EnergyGoal.LOSE,
    GoalType.GAIN_WEIGHT: EnergyGoal.GAIN,
}
"""Weight goals change intake; every other goal (and no goal) eats at maintenance."""

DEFAULT_LIFESTYLE = Lifestyle.LIGHT
"""Until the profile asks about daily movement, assume light activity outside training."""

TRAINING_MET = 6.0
"""Average intensity assumed for planned sessions (moderate running, cycling, gym: about 5-8 MET).

Net of rest: (MET - 1) x 3.5 ml O2/kg/min x 5 kcal/l. Deliberately moderate, so a weight-loss
deficit is never built on training energy that was left out.
"""

TRAINING_ESTIMATE_REASON = (
    "Training energy is estimated from your planned week ({minutes} min a day on average). "
    "Eat more on long or hard days; logged workouts will make this exact."
)


def energy_goal(goal: GoalType | None) -> EnergyGoal:
    """The direction of body-mass change a goal implies."""
    return GOAL_TO_ENERGY.get(goal, EnergyGoal.MAINTAIN)


def estimated_training_kcal(
    weight_kg: float, days_per_week: int, minutes_per_session: int
) -> float:
    """Average daily training energy (net of rest) from the athlete's planned week."""
    minutes_per_day = days_per_week * minutes_per_session / 7
    kcal_per_minute = (TRAINING_MET - 1) * 3.5 * weight_kg * 5 / 1000
    return minutes_per_day * kcal_per_minute


def targets_for(athlete: AthleteSnapshot, today: date) -> tuple[EnergyGoal, NutritionTargets]:
    """Today's targets, including an estimate of training energy until workouts are logged."""
    goal = energy_goal(athlete.primary_goal)
    body = BodyData(
        weight_kg=athlete.weight_kg,
        height_cm=athlete.height_cm,
        age_years=age_on(athlete.birth_year, today),
        sex=Sex(athlete.sex.value),
    )
    training = estimated_training_kcal(
        athlete.weight_kg, athlete.available_days_per_week, athlete.minutes_per_session
    )
    targets = daily_targets(body, DEFAULT_LIFESTYLE, goal, training_kcal=training)
    minutes = round(athlete.available_days_per_week * athlete.minutes_per_session / 7)
    reason = TRAINING_ESTIMATE_REASON.format(minutes=minutes)
    return goal, NutritionTargets(
        kcal=targets.kcal,
        protein_g=targets.protein_g,
        carbs_g=targets.carbs_g,
        fat_g=targets.fat_g,
        maintenance_kcal=targets.maintenance_kcal,
        floor_applied=targets.floor_applied,
        reasons=(*targets.reasons, reason),
    )
