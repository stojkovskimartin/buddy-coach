"""Vitamins and minerals: reference intakes, upper limits and food sources.

Reference values: D-A-CH reference values for adults (19-65 years). Upper limits: EFSA
tolerable upper intake levels. Values are common guidance and must be reviewed by a qualified
nutritionist before launch (ADR-0005).
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from buddy_coach.science.nutrition import Sex


class Nutrient(StrEnum):
    """Micronutrients (and fibre) the coach tracks."""

    VITAMIN_D = "vitamin_d"
    VITAMIN_B12 = "vitamin_b12"
    VITAMIN_C = "vitamin_c"
    FOLATE = "folate"
    IRON = "iron"
    CALCIUM = "calcium"
    MAGNESIUM = "magnesium"
    ZINC = "zinc"
    POTASSIUM = "potassium"
    FIBRE = "fibre"


UNITS: dict[Nutrient, str] = {
    Nutrient.VITAMIN_D: "µg",
    Nutrient.VITAMIN_B12: "µg",
    Nutrient.VITAMIN_C: "mg",
    Nutrient.FOLATE: "µg",
    Nutrient.IRON: "mg",
    Nutrient.CALCIUM: "mg",
    Nutrient.MAGNESIUM: "mg",
    Nutrient.ZINC: "mg",
    Nutrient.POTASSIUM: "mg",
    Nutrient.FIBRE: "g",
}

# Daily reference intake per sex (D-A-CH, adults). Iron for women: before menopause.
REFERENCE_INTAKE: dict[Nutrient, dict[Sex, float]] = {
    Nutrient.VITAMIN_D: {Sex.MALE: 20, Sex.FEMALE: 20},
    Nutrient.VITAMIN_B12: {Sex.MALE: 4, Sex.FEMALE: 4},
    Nutrient.VITAMIN_C: {Sex.MALE: 110, Sex.FEMALE: 95},
    Nutrient.FOLATE: {Sex.MALE: 300, Sex.FEMALE: 300},
    Nutrient.IRON: {Sex.MALE: 11, Sex.FEMALE: 16},
    Nutrient.CALCIUM: {Sex.MALE: 1000, Sex.FEMALE: 1000},
    Nutrient.MAGNESIUM: {Sex.MALE: 350, Sex.FEMALE: 300},
    Nutrient.ZINC: {Sex.MALE: 14, Sex.FEMALE: 8},
    Nutrient.POTASSIUM: {Sex.MALE: 4000, Sex.FEMALE: 4000},
    Nutrient.FIBRE: {Sex.MALE: 30, Sex.FEMALE: 30},
}

# Tolerable upper intake level per day from all sources (EFSA). Magnesium: supplements only.
UPPER_LIMIT: dict[Nutrient, float] = {
    Nutrient.VITAMIN_D: 100,
    Nutrient.CALCIUM: 2500,
    Nutrient.ZINC: 25,
    Nutrient.MAGNESIUM: 250,
}

FOOD_SOURCES: dict[Nutrient, tuple[str, ...]] = {
    Nutrient.VITAMIN_D: ("fatty fish (salmon, herring, mackerel)", "eggs", "sunlight on skin"),
    Nutrient.VITAMIN_B12: ("meat", "fish", "dairy", "eggs", "fortified plant drinks (vegans)"),
    Nutrient.VITAMIN_C: ("peppers", "citrus fruit", "kiwi", "broccoli", "berries"),
    Nutrient.FOLATE: ("leafy greens", "legumes", "whole grains", "asparagus"),
    Nutrient.IRON: ("red meat", "legumes", "whole grains", "seeds; eat with vitamin C"),
    Nutrient.CALCIUM: ("dairy", "calcium-rich mineral water", "fortified plant drinks", "kale"),
    Nutrient.MAGNESIUM: ("nuts and seeds", "whole grains", "legumes", "dark chocolate"),
    Nutrient.ZINC: ("meat", "seafood", "legumes", "seeds", "whole grains"),
    Nutrient.POTASSIUM: ("potatoes", "bananas", "legumes", "vegetables"),
    Nutrient.FIBRE: ("whole grains", "legumes", "vegetables", "fruit", "nuts"),
}

LOW_THRESHOLD = 0.7  # below 70% of the reference on average is flagged as "low"


class IntakeStatus(StrEnum):
    """How average intake compares to the reference and upper limit."""

    LOW = "low"
    OK = "ok"
    ABOVE_UPPER_LIMIT = "above_upper_limit"


@dataclass(frozen=True, slots=True)
class NutrientAssessment:
    """One nutrient: average intake vs reference, with food ideas when low."""

    nutrient: Nutrient
    unit: str
    average_intake: float
    reference: float
    percent_of_reference: int
    status: IntakeStatus
    food_sources: tuple[str, ...]


def reference_for(nutrient: Nutrient, sex: Sex) -> float:
    """Daily reference intake for an adult."""
    return REFERENCE_INTAKE[nutrient][sex]


def assess_intake(
    daily_intakes: Sequence[Mapping[Nutrient, float]], sex: Sex, *, min_days: int = 3
) -> list[NutrientAssessment]:
    """Average logged intake over several days and compare it with references.

    Single days vary a lot, so fewer than ``min_days`` logged days gives no assessment.
    Nutrients missing from a day count as 0 for that day (the food database knows them all).
    """
    if len(daily_intakes) < min_days:
        return []
    results: list[NutrientAssessment] = []
    for nutrient in Nutrient:
        values = [day.get(nutrient, 0.0) for day in daily_intakes]
        if not all(math.isfinite(v) and v >= 0 for v in values):
            msg = f"intake values for {nutrient} must be finite and non-negative"
            raise ValueError(msg)
        average = sum(values) / len(values)
        reference = reference_for(nutrient, sex)
        ratio = average / reference
        upper = UPPER_LIMIT.get(nutrient)
        if upper is not None and average > upper:
            status = IntakeStatus.ABOVE_UPPER_LIMIT
        elif ratio < LOW_THRESHOLD:
            status = IntakeStatus.LOW
        else:
            status = IntakeStatus.OK
        results.append(
            NutrientAssessment(
                nutrient=nutrient,
                unit=UNITS[nutrient],
                average_intake=round(average, 1),
                reference=reference,
                percent_of_reference=round(100 * ratio),
                status=status,
                food_sources=FOOD_SOURCES[nutrient] if status is IntakeStatus.LOW else (),
            )
        )
    return results
