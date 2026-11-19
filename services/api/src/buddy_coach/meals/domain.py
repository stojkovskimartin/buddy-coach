"""Rules for food-diary entries, free of frameworks."""

from __future__ import annotations

from datetime import date
from enum import StrEnum

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.science.nutrition import KCAL_PER_G_FAT

MAX_RANGE_DAYS = 366
MAX_GRAMS = 5000.0
ROUNDING_TOLERANCE = 1.05
"""Labels round their values; a few percent over the physical limit is still plausible."""


class MealSlot(StrEnum):
    """When in the day the food was eaten."""

    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class FoodSource(StrEnum):
    """Where the nutrient values came from."""

    MANUAL = "manual"
    OPEN_FOOD_FACTS = "open_food_facts"


def check_plausible(
    grams: float, kcal: float, protein_g: float, carbs_g: float, fat_g: float
) -> None:
    """A portion cannot hold more macronutrients than its weight, nor more energy than pure fat.
    Catches unit mix-ups such as kilojoules sent as kilocalories."""
    if protein_g + carbs_g + fat_g > grams * ROUNDING_TOLERANCE:
        raise ValidationFailedError(
            "Protein, carbs and fat add up to more than the portion weighs."
        )
    if kcal > grams * KCAL_PER_G_FAT * ROUNDING_TOLERANCE:
        raise ValidationFailedError(
            "That is more energy than the portion can hold. kJ instead of kcal?"
        )


def validate_range(start: date, end: date) -> None:
    """History queries are bounded."""
    if end < start:
        raise ValidationFailedError(f"The range ends ({end}) before it starts ({start}).")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationFailedError(f"At most {MAX_RANGE_DAYS} days per request.")
