"""Public response models of the nutrition module."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from buddy_coach.science.nutrition import EnergyGoal


class TargetsOut(BaseModel):
    """Today's energy and macro targets and why they are what they are."""

    day: date
    goal: EnergyGoal
    kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    maintenance_kcal: int
    floor_applied: bool
    training_kcal_estimated: bool
    """True while training energy comes from the planned week, not from logged workouts."""
    reasons: list[str]
