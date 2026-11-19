"""Public request/response models of the meals module."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from buddy_coach.meals.domain import MAX_GRAMS, FoodSource, MealSlot

MAX_KCAL = 10_000.0


class MealEntryIn(BaseModel):
    """A food and the nutrients of the portion eaten (computed by the app from per-100 g values)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    meal: MealSlot
    name: str = Field(min_length=1, max_length=120)
    grams: float = Field(gt=0, le=MAX_GRAMS)
    kcal: float = Field(ge=0, le=MAX_KCAL)
    protein_g: float = Field(ge=0, le=MAX_GRAMS)
    carbs_g: float = Field(ge=0, le=MAX_GRAMS)
    fat_g: float = Field(ge=0, le=MAX_GRAMS)
    source: FoodSource = FoodSource.MANUAL
    barcode: str | None = Field(default=None, pattern=r"^\d{6,32}$")
    eaten_at: AwareDatetime | None = Field(
        default=None, description="When it was eaten, with its UTC offset; default now"
    )


class MealEntryOut(BaseModel):
    """A stored diary entry."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    eaten_at: datetime
    day: date
    meal: MealSlot
    name: str
    grams: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    source: FoodSource
    barcode: str | None


class NutrientTotals(BaseModel):
    """Sums of a day (or of any set of entries)."""

    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float


class MealDayOut(BaseModel):
    """One day of the diary: entries in the order eaten and their totals."""

    day: date
    entries: list[MealEntryOut]
    totals: NutrientTotals


class DailyTotalsOut(NutrientTotals):
    """Totals of one day that has entries."""

    day: date
