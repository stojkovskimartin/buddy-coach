"""Energy and macronutrient targets."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import StrEnum

KCAL_PER_KG_BODY_MASS = 7700.0  # common approximation for adipose tissue
KCAL_PER_G_PROTEIN = 4.0
KCAL_PER_G_CARBS = 4.0
KCAL_PER_G_FAT = 9.0

WATCH_ENERGY_DISCOUNT = 0.75  # wearables tend to overestimate exercise energy
MAX_TRAINING_KCAL = 10_000.0
MIN_FAT_G_PER_KG = 0.6
FAT_SHARE_OF_ENERGY = 0.25
MAX_PROTEIN_SHARE_OF_ENERGY = 0.35
REFERENCE_BMI = 25.0

MAX_LOSS_RATE_PCT_PER_WEEK = 1.0
MAX_GAIN_RATE_PCT_PER_WEEK = 0.5
DEFAULT_LOSS_RATE_PCT_PER_WEEK = 0.5
DEFAULT_GAIN_RATE_PCT_PER_WEEK = 0.25

MIN_DAYS_FOR_ADAPTIVE_TDEE = 14
MIN_INTAKE_COVERAGE = 0.8
MAX_ADAPTIVE_DEVIATION = 0.25
PLAUSIBLE_TDEE_RANGE = (1200.0, 6000.0)

WEIGHT_RANGE_KG = (30.0, 300.0)
HEIGHT_RANGE_CM = (120.0, 230.0)
AGE_RANGE_YEARS = (18, 100)  # Mifflin-St Jeor is validated for adults


class Sex(StrEnum):
    """Sex used by energy and load equations."""

    MALE = "male"
    FEMALE = "female"


ABSOLUTE_KCAL_FLOOR = {Sex.MALE: 1500.0, Sex.FEMALE: 1200.0}


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


def _require_finite(name: str, value: float) -> None:
    if not math.isfinite(value):
        msg = f"{name} must be a finite number"
        raise ValueError(msg)


def _require_range(name: str, value: float, bounds: tuple[float, float]) -> None:
    _require_finite(name, value)
    low, high = bounds
    if not low <= value <= high:
        msg = f"{name} must be between {low:g} and {high:g}"
        raise ValueError(msg)


@dataclass(frozen=True, slots=True)
class BodyData:
    """What the energy equations need about a person. Validated on creation."""

    weight_kg: float
    height_cm: float
    age_years: int
    sex: Sex

    def __post_init__(self) -> None:
        _require_range("weight_kg", self.weight_kg, WEIGHT_RANGE_KG)
        _require_range("height_cm", self.height_cm, HEIGHT_RANGE_CM)
        _require_range("age_years", self.age_years, AGE_RANGE_YEARS)
        if not isinstance(self.sex, Sex):
            msg = "sex must be a Sex value"
            raise TypeError(msg)

    @property
    def reference_weight_kg(self) -> float:
        """Weight used for per-kg targets: actual weight, capped at the weight for BMI 25.

        Protein and fat needs scale with lean mass, not total mass, so per-kg rules applied to
        high body weights would overshoot.
        """
        height_m = self.height_cm / 100
        return min(self.weight_kg, REFERENCE_BMI * height_m * height_m)


@dataclass(frozen=True, slots=True)
class NutritionTargets:
    """Daily targets with the reasons behind them, so the coach can explain them.

    Macros always add up to ``kcal`` within rounding.
    """

    kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    maintenance_kcal: int
    floor_applied: bool
    reasons: tuple[str, ...] = field(default_factory=tuple)


def bmr_mifflin_st_jeor(body: BodyData) -> float:
    """Resting energy expenditure in kcal/day (Mifflin-St Jeor)."""
    sex_constant = 5.0 if body.sex is Sex.MALE else -161.0
    return 10.0 * body.weight_kg + 6.25 * body.height_cm - 5.0 * body.age_years + sex_constant


def maintenance_kcal(body: BodyData, lifestyle: Lifestyle, training_kcal: float) -> float:
    """Total expenditure: resting x non-exercise factor + discounted training energy."""
    _require_range("training_kcal", training_kcal, (0.0, MAX_TRAINING_KCAL))
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
    it is capped at safe maxima and not allowed for maintenance. ``maintenance_override_kcal``
    lets a measured (adaptive) expenditure replace the formula estimate; it is clamped to a
    plausible range.
    """
    reasons: list[str] = []
    if maintenance_override_kcal is not None:
        _require_finite("maintenance_override_kcal", maintenance_override_kcal)
        low, high = PLAUSIBLE_TDEE_RANGE
        maintenance = min(max(maintenance_override_kcal, low), high)
        reasons.append("Maintenance is based on your measured intake and weight trend.")
    else:
        maintenance = maintenance_kcal(body, lifestyle, training_kcal)

    kcal = maintenance + _daily_energy_change(body, goal, rate_pct_per_week, reasons)

    floor = max(bmr_mifflin_st_jeor(body), ABSOLUTE_KCAL_FLOOR[body.sex])
    floor_applied = kcal < floor
    if floor_applied:
        kcal = floor
        reasons.append("Intake is held at a safe minimum; the deficit is smaller than requested.")

    protein_g, fat_g, carbs_g = _split_macros(body, goal, kcal)
    return NutritionTargets(
        kcal=round(kcal),
        protein_g=round(protein_g),
        carbs_g=round(carbs_g),
        fat_g=round(fat_g),
        maintenance_kcal=round(maintenance),
        floor_applied=floor_applied,
        reasons=tuple(reasons),
    )


def _split_macros(body: BodyData, goal: EnergyGoal, kcal: float) -> tuple[float, float, float]:
    """Protein first (capped at 35% of energy), then fat, carbohydrate takes the rest."""
    reference = body.reference_weight_kg
    protein_g = min(
        PROTEIN_G_PER_KG[goal] * reference,
        MAX_PROTEIN_SHARE_OF_ENERGY * kcal / KCAL_PER_G_PROTEIN,
    )
    min_fat_g = MIN_FAT_G_PER_KG * reference
    fat_g = max(FAT_SHARE_OF_ENERGY * kcal / KCAL_PER_G_FAT, min_fat_g)
    carbs_kcal = kcal - protein_g * KCAL_PER_G_PROTEIN - fat_g * KCAL_PER_G_FAT
    if carbs_kcal < 0:
        fat_g = min_fat_g
        carbs_kcal = kcal - protein_g * KCAL_PER_G_PROTEIN - fat_g * KCAL_PER_G_FAT
    if carbs_kcal < 0:
        # Only possible for extreme inputs: shrink protein so the totals still add up.
        protein_g = (kcal - fat_g * KCAL_PER_G_FAT) / KCAL_PER_G_PROTEIN
        carbs_kcal = 0.0
    return protein_g, fat_g, carbs_kcal / KCAL_PER_G_CARBS


def _daily_energy_change(
    body: BodyData, goal: EnergyGoal, rate_pct_per_week: float | None, reasons: list[str]
) -> float:
    if goal is EnergyGoal.MAINTAIN:
        if rate_pct_per_week is not None:
            msg = "rate_pct_per_week does not apply to maintenance"
            raise ValueError(msg)
        return 0.0
    if rate_pct_per_week is not None:
        _require_finite("rate_pct_per_week", rate_pct_per_week)
        if rate_pct_per_week <= 0:
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


TREND_WINDOW_DAYS = 7


def weight_trend(
    daily: Sequence[WeightEntry], window_days: int = TREND_WINDOW_DAYS
) -> list[WeightEntry]:
    """For each measured day, the mean of the measured days in the ``window_days`` up to it.

    ``daily`` holds one weight per day (the morning one is the most comparable). Days without a
    measurement are not filled in. Smooths the day-to-day water swings of 1-2 kg.
    """
    ordered = sorted(daily, key=lambda w: w.day)
    trend: list[WeightEntry] = []
    for entry in ordered:
        window = [
            w.weight_kg
            for w in ordered
            if entry.day - timedelta(days=window_days - 1) <= w.day <= entry.day
        ]
        trend.append(WeightEntry(day=entry.day, weight_kg=sum(window) / len(window)))
    return trend


def adaptive_maintenance_kcal(
    intakes: Sequence[DailyIntake],
    weights: Sequence[WeightEntry],
    *,
    formula_estimate_kcal: float | None = None,
) -> float | None:
    """Back-calculate real expenditure from logged intake and the weight trend.

    Only intake inside the weight window counts, and at least 80% of those days must be logged.
    Returns None when data is insufficient or the result is implausible (usually incomplete
    logging). With ``formula_estimate_kcal`` the result moves at most 25% away from it.
    """
    if len(weights) < 2:
        return None
    first, last = min(w.day for w in weights), max(w.day for w in weights)
    span_days = (last - first).days + 1
    if span_days < MIN_DAYS_FOR_ADAPTIVE_TDEE:
        return None
    in_window = [i for i in intakes if first <= i.day <= last and math.isfinite(i.kcal)]
    logged_days = len({i.day for i in in_window})
    if logged_days < MIN_DAYS_FOR_ADAPTIVE_TDEE or logged_days < MIN_INTAKE_COVERAGE * span_days:
        return None

    mean_intake = sum(i.kcal for i in in_window) / len(in_window)
    estimate = mean_intake - weight_trend_kg_per_day(weights) * KCAL_PER_KG_BODY_MASS
    low, high = PLAUSIBLE_TDEE_RANGE
    if not low <= estimate <= high:
        return None
    if formula_estimate_kcal is not None:
        _require_finite("formula_estimate_kcal", formula_estimate_kcal)
        lower = formula_estimate_kcal * (1 - MAX_ADAPTIVE_DEVIATION)
        upper = formula_estimate_kcal * (1 + MAX_ADAPTIVE_DEVIATION)
        estimate = min(max(estimate, lower), upper)
    return estimate


def session_carbs_g_per_hour(duration_min: float) -> int:
    """Carbohydrate to take in during a session, by duration (common endurance guidance)."""
    _require_range("duration_min", duration_min, (0.0, 24 * 60.0))
    if duration_min < 60:
        return 0
    if duration_min <= 150:
        return 45
    return 75
