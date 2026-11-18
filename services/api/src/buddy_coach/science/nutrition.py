"""Energy and macronutrient targets."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

KCAL_PER_KG_BODY_MASS = 7700.0  # common approximation for adipose tissue
KCAL_PER_G_PROTEIN = 4.0
KCAL_PER_G_CARBS = 4.0
KCAL_PER_G_FAT = 9.0

WATCH_ENERGY_DISCOUNT = 0.75  # wearables tend to overestimate exercise energy
MIN_FAT_G_PER_KG = 0.6
FAT_SHARE_OF_ENERGY = 0.25
ABSOLUTE_KCAL_FLOOR = {"male": 1500.0, "female": 1200.0}

MAX_LOSS_RATE_PCT_PER_WEEK = 1.0
MAX_GAIN_RATE_PCT_PER_WEEK = 0.5
DEFAULT_LOSS_RATE_PCT_PER_WEEK = 0.5
DEFAULT_GAIN_RATE_PCT_PER_WEEK = 0.25

MIN_DAYS_FOR_ADAPTIVE_TDEE = 14
PLAUSIBLE_TDEE_RANGE = (1200.0, 6000.0)


class Lifestyle(StrEnum):
    """Activity outside of training (job, commuting, daily movement)."""

    SEDENTARY = "sedentary"
    LIGHT = "light"
    ACTIVE = "active"
    VERY_ACTIVE = "very_active"


NON_EXERCISE_FACTOR = {
    Lifestyle.SEDENTARY: 1.2,
    Lifestyle.LIGHT: 1.3,
    Lifestyle.ACTIVE: 1.4,
    Lifestyle.VERY_ACTIVE: 1.55,
}


class EnergyGoal(StrEnum):
    """Direction of body-mass change."""

    LOSE = "lose"
    MAINTAIN = "maintain"
    GAIN = "gain"


PROTEIN_G_PER_KG = {EnergyGoal.LOSE: 2.0, EnergyGoal.MAINTAIN: 1.6, EnergyGoal.GAIN: 1.8}


@dataclass(frozen=True, slots=True)
class BodyData:
    """What the energy equations need about a person."""

    weight_kg: float
    height_cm: float
    age_years: int
    sex: str  # "male" | "female"

    def __post_init__(self) -> None:
        if self.sex not in ABSOLUTE_KCAL_FLOOR:
            msg = f"sex must be one of {sorted(ABSOLUTE_KCAL_FLOOR)}"
            raise ValueError(msg)
        if self.weight_kg <= 0 or self.height_cm <= 0 or self.age_years <= 0:
            msg = "weight, height and age must be positive"
            raise ValueError(msg)


@dataclass(frozen=True, slots=True)
class NutritionTargets:
    """Daily targets with the reasons behind them, so the coach can explain them."""

    kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    maintenance_kcal: int
    floor_applied: bool
    reasons: tuple[str, ...] = field(default_factory=tuple)


def bmr_mifflin_st_jeor(body: BodyData) -> float:
    """Resting energy expenditure in kcal/day (Mifflin-St Jeor)."""
    sex_constant = 5.0 if body.sex == "male" else -161.0
    return 10.0 * body.weight_kg + 6.25 * body.height_cm - 5.0 * body.age_years + sex_constant


def maintenance_kcal(body: BodyData, lifestyle: Lifestyle, training_kcal: float) -> float:
    """Total expenditure: resting x non-exercise factor + discounted training energy."""
    if training_kcal < 0:
        msg = "training_kcal cannot be negative"
        raise ValueError(msg)
    resting = bmr_mifflin_st_jeor(body) * NON_EXERCISE_FACTOR[lifestyle]
    return resting + training_kcal * WATCH_ENERGY_DISCOUNT


def daily_targets(
    body: BodyData,
    lifestyle: Lifestyle,
    goal: EnergyGoal,
    *,
    training_kcal: float = 0.0,
    rate_pct_per_week: float | None = None,
    maintenance_override_kcal: float | None = None,
) -> NutritionTargets:
    """Daily energy and macro targets.

    ``rate_pct_per_week`` is the desired change in body mass (percent of body weight per week);
    it is capped at safe maxima. ``maintenance_override_kcal`` lets a measured (adaptive)
    expenditure replace the formula estimate.
    """
    reasons: list[str] = []
    maintenance = (
        maintenance_override_kcal
        if maintenance_override_kcal is not None
        else maintenance_kcal(body, lifestyle, training_kcal)
    )
    if maintenance_override_kcal is not None:
        reasons.append("Maintenance is based on your measured intake and weight trend.")

    daily_change = _daily_energy_change(body, goal, rate_pct_per_week, reasons)
    kcal = maintenance + daily_change

    floor = max(bmr_mifflin_st_jeor(body), ABSOLUTE_KCAL_FLOOR[body.sex])
    floor_applied = kcal < floor
    if floor_applied:
        kcal = floor
        reasons.append("Intake is held at a safe minimum; the deficit is smaller than requested.")

    protein_g = PROTEIN_G_PER_KG[goal] * body.weight_kg
    fat_g = max(FAT_SHARE_OF_ENERGY * kcal / KCAL_PER_G_FAT, MIN_FAT_G_PER_KG * body.weight_kg)
    carbs_kcal = kcal - protein_g * KCAL_PER_G_PROTEIN - fat_g * KCAL_PER_G_FAT
    if carbs_kcal < 0:
        # Very low budgets: keep protein, trim fat down to its minimum first.
        fat_g = MIN_FAT_G_PER_KG * body.weight_kg
        carbs_kcal = max(0.0, kcal - protein_g * KCAL_PER_G_PROTEIN - fat_g * KCAL_PER_G_FAT)
    carbs_g = carbs_kcal / KCAL_PER_G_CARBS

    return NutritionTargets(
        kcal=round(kcal),
        protein_g=round(protein_g),
        carbs_g=round(carbs_g),
        fat_g=round(fat_g),
        maintenance_kcal=round(maintenance),
        floor_applied=floor_applied,
        reasons=tuple(reasons),
    )


def _daily_energy_change(
    body: BodyData, goal: EnergyGoal, rate_pct_per_week: float | None, reasons: list[str]
) -> float:
    if goal is EnergyGoal.MAINTAIN:
        return 0.0
    if rate_pct_per_week is not None and rate_pct_per_week <= 0:
        msg = "rate_pct_per_week must be positive"
        raise ValueError(msg)
    if goal is EnergyGoal.LOSE:
        default, cap, sign = DEFAULT_LOSS_RATE_PCT_PER_WEEK, MAX_LOSS_RATE_PCT_PER_WEEK, -1.0
    else:
        default, cap, sign = DEFAULT_GAIN_RATE_PCT_PER_WEEK, MAX_GAIN_RATE_PCT_PER_WEEK, 1.0
    rate = default if rate_pct_per_week is None else rate_pct_per_week
    if rate > cap:
        reasons.append(f"Rate capped at {cap}% of body weight per week for safety.")
        rate = cap
    kg_per_week = body.weight_kg * rate / 100.0
    return sign * kg_per_week * KCAL_PER_KG_BODY_MASS / 7.0


@dataclass(frozen=True, slots=True)
class DailyIntake:
    """Logged energy intake for one day."""

    day: date
    kcal: float


@dataclass(frozen=True, slots=True)
class WeightEntry:
    """A body-weight measurement."""

    day: date
    weight_kg: float


def weight_trend_kg_per_day(weights: Sequence[WeightEntry]) -> float:
    """Least-squares slope of body weight over time (kg/day). Smooths daily water swings."""
    if len(weights) < 2:
        msg = "need at least two weight entries"
        raise ValueError(msg)
    origin = min(w.day for w in weights)
    xs = [(w.day - origin).days for w in weights]
    ys = [w.weight_kg for w in weights]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    var_x = sum((x - mean_x) ** 2 for x in xs)
    if var_x == 0:
        msg = "weight entries must span more than one day"
        raise ValueError(msg)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    return cov / var_x


def adaptive_maintenance_kcal(
    intakes: Sequence[DailyIntake], weights: Sequence[WeightEntry]
) -> float | None:
    """Back-calculate real expenditure from logged intake and the weight trend.

    Returns None when there is not enough data (fewer than 14 logged days or weights that do not
    span 14 days), or when the result is implausible, which usually means incomplete logging.
    """
    if len(intakes) < MIN_DAYS_FOR_ADAPTIVE_TDEE or len(weights) < 2:
        return None
    span = (max(w.day for w in weights) - min(w.day for w in weights)).days
    if span < MIN_DAYS_FOR_ADAPTIVE_TDEE - 1:
        return None
    mean_intake = sum(i.kcal for i in intakes) / len(intakes)
    estimate = mean_intake - weight_trend_kg_per_day(weights) * KCAL_PER_KG_BODY_MASS
    low, high = PLAUSIBLE_TDEE_RANGE
    return estimate if low <= estimate <= high else None


def session_carbs_g_per_hour(duration_min: float) -> int:
    """Carbohydrate to take in during a session, by duration (common endurance guidance)."""
    if duration_min < 0:
        msg = "duration cannot be negative"
        raise ValueError(msg)
    if duration_min < 60:
        return 0
    if duration_min <= 150:
        return 45
    return 75
