"""Recovery nutrition: protein spread over the day, refuelling after training, fluids.

Common sports-nutrition guidance (ISSN, ACSM position stands); to be reviewed before launch.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum

from buddy_coach.science.nutrition import BodyData

PROTEIN_G_PER_KG_PER_MEAL = 0.3
MIN_PROTEIN_PER_MEAL_G = 20.0
MAX_PROTEIN_PER_MEAL_G = 40.0
FLUID_REPLACEMENT_FACTOR = 1.5  # litres per kg body mass lost (losses continue after exercise)


class SessionIntensity(StrEnum):
    """How hard a session was."""

    EASY = "easy"
    MODERATE = "moderate"
    HARD = "hard"


@dataclass(frozen=True, slots=True)
class ProteinDistribution:
    """Protein per meal and the resulting daily total."""

    meals: int
    protein_per_meal_g: int
    daily_total_g: int
    tip: str


def protein_distribution(body: BodyData, meals: int = 4) -> ProteinDistribution:
    """Spread protein evenly: about 0.3 g/kg per meal, 3-5 meals including one before sleep."""
    if not 3 <= meals <= 6:
        msg = "meals must be between 3 and 6"
        raise ValueError(msg)
    per_meal = PROTEIN_G_PER_KG_PER_MEAL * body.reference_weight_kg
    per_meal = min(max(per_meal, MIN_PROTEIN_PER_MEAL_G), MAX_PROTEIN_PER_MEAL_G)
    return ProteinDistribution(
        meals=meals,
        protein_per_meal_g=round(per_meal),
        daily_total_g=round(per_meal) * meals,  # what the user actually eats
        tip="Spread protein over the day; a protein-rich last meal supports overnight recovery.",
    )


@dataclass(frozen=True, slots=True)
class RecoveryMeal:
    """What to eat and drink after a session."""

    carbs_g: int
    protein_g: int
    fluid_ml: int | None
    timing: str
    reason: str


def post_session_recovery(
    body: BodyData,
    duration_min: float,
    intensity: SessionIntensity,
    *,
    hours_until_next_session: float | None = None,
    body_mass_lost_kg: float | None = None,
) -> RecoveryMeal:
    """Carbohydrate and protein after training; urgent when the next session is soon."""
    if not math.isfinite(duration_min) or not 0 < duration_min <= 24 * 60:
        msg = "duration_min must be between 0 and 1440"
        raise ValueError(msg)
    weight = body.weight_kg
    protein = min(
        max(PROTEIN_G_PER_KG_PER_MEAL * body.reference_weight_kg, MIN_PROTEIN_PER_MEAL_G),
        MAX_PROTEIN_PER_MEAL_G,
    )
    quick_turnaround = hours_until_next_session is not None and hours_until_next_session < 8
    if quick_turnaround:
        carbs_per_kg, timing = 1.2, "within 30-60 minutes, then again every 1-2 hours"
        reason = "Your next session is soon, so refilling glycogen quickly matters."
    elif intensity is SessionIntensity.HARD or duration_min >= 90:
        carbs_per_kg, timing = 1.0, "within about 2 hours, as a normal meal"
        reason = "A long or hard session used a lot of stored carbohydrate."
    elif intensity is SessionIntensity.MODERATE:
        carbs_per_kg, timing = 0.5, "with your next regular meal"
        reason = "A moderate session: your normal meals refill the stores."
    else:
        carbs_per_kg, timing = 0.0, "no special recovery meal needed"
        reason = "An easy session: just eat your planned meals."

    fluid_ml: int | None = None
    if body_mass_lost_kg is not None:
        if not math.isfinite(body_mass_lost_kg) or not 0 <= body_mass_lost_kg <= 5:
            msg = "body_mass_lost_kg must be between 0 and 5"
            raise ValueError(msg)
        fluid_ml = round(body_mass_lost_kg * FLUID_REPLACEMENT_FACTOR * 1000)

    return RecoveryMeal(
        carbs_g=round(carbs_per_kg * weight),
        protein_g=round(protein) if carbs_per_kg > 0 else 0,
        fluid_ml=fluid_ml,
        timing=timing,
        reason=reason,
    )
