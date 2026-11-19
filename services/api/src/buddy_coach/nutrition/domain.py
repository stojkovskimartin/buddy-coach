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

GOAL_TO_ENERGY = {GoalType.LOSE_WEIGHT: EnergyGoal.LOSE, GoalType.GAIN_WEIGHT: EnergyGoal.GAIN}
"""Weight goals change intake; every other goal (and no goal) eats at maintenance."""

DEFAULT_LIFESTYLE = Lifestyle.LIGHT
"""Until the profile asks about daily movement, assume light activity outside training."""


def energy_goal(goal: GoalType | None) -> EnergyGoal:
    """The direction of body-mass change a goal implies."""
    return GOAL_TO_ENERGY.get(goal, EnergyGoal.MAINTAIN) if goal else EnergyGoal.MAINTAIN


def targets_for(athlete: AthleteSnapshot, today: date) -> tuple[EnergyGoal, NutritionTargets]:
    """Today's targets. Training energy is added once workouts are logged (not yet)."""
    goal = energy_goal(athlete.primary_goal)
    body = BodyData(
        weight_kg=athlete.weight_kg,
        height_cm=athlete.height_cm,
        age_years=age_on(athlete.birth_year, today),
        sex=Sex(athlete.sex.value),
    )
    return goal, daily_targets(body, DEFAULT_LIFESTYLE, goal)
