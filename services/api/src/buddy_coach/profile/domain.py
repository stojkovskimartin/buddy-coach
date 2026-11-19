"""Pure profile and goal rules. No I/O, no framework imports."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from buddy_coach.core.errors import ValidationFailedError

MIN_AGE_YEARS = 18  # adults only at launch (see SECURITY.md)
MAX_GOAL_HORIZON_DAYS = 3 * 365
MIN_WEIGHT_KG = 30.0
MAX_WEIGHT_KG = 300.0


class Sex(StrEnum):
    """Sex used for energy-expenditure equations."""

    MALE = "male"
    FEMALE = "female"


class ExperienceLevel(StrEnum):
    """Training experience."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    ELITE = "elite"


class CoachStyle(StrEnum):
    """How the coach talks to the user."""

    FRIENDLY = "friendly"
    STRICT = "strict"
    DATA_DRIVEN = "data_driven"


class GoalType(StrEnum):
    """What the user wants to achieve."""

    LOSE_WEIGHT = "lose_weight"
    GAIN_WEIGHT = "gain_weight"
    MAINTAIN_WEIGHT = "maintain_weight"
    RECOMPOSITION = "recomposition"
    ENDURANCE_EVENT = "endurance_event"
    MOUNTAIN_SPORT = "mountain_sport"
    STRENGTH = "strength"
    GENERAL_FITNESS = "general_fitness"


class Sport(StrEnum):
    """Sports the coach can plan for."""

    RUNNING = "running"
    CYCLING = "cycling"
    SWIMMING = "swimming"
    TRIATHLON = "triathlon"
    HIKING = "hiking"
    SKI_TOURING = "ski_touring"
    ALPINE_SKIING = "alpine_skiing"
    CLIMBING = "climbing"
    STRENGTH = "strength"
    OTHER = "other"


ENDURANCE_SPORTS = frozenset({Sport.RUNNING, Sport.CYCLING, Sport.SWIMMING, Sport.TRIATHLON})
MOUNTAIN_SPORTS = frozenset({Sport.HIKING, Sport.SKI_TOURING, Sport.ALPINE_SKIING, Sport.CLIMBING})
WEIGHT_GOALS = frozenset({GoalType.LOSE_WEIGHT, GoalType.GAIN_WEIGHT})


class GoalPriority(StrEnum):
    """A user has at most one active primary goal."""

    PRIMARY = "primary"
    SECONDARY = "secondary"


class GoalStatus(StrEnum):
    """Lifecycle of a goal."""

    ACTIVE = "active"
    ACHIEVED = "achieved"
    ABANDONED = "abandoned"


def age_on(birth_year: int, today: date) -> int:
    """Age in whole years, assuming a mid-year birthday when only the year is known."""
    return today.year - birth_year - (1 if (today.month, today.day) < (7, 1) else 0)


def validate_adult(birth_year: int, today: date) -> None:
    """Reject users under the minimum age."""
    if age_on(birth_year, today) < MIN_AGE_YEARS:
        raise ValidationFailedError(f"Buddy Coach is for people aged {MIN_AGE_YEARS} and over.")


@dataclass(frozen=True, slots=True)
class GoalSpec:
    """The fields of a goal that business rules look at."""

    goal_type: GoalType
    sport: Sport | None = None
    target_weight_kg: float | None = None
    target_date: date | None = None
    event_distance_km: float | None = None


def validate_goal(spec: GoalSpec, today: date, current_weight_kg: float | None) -> None:
    """Check a goal against business rules. Raises ValidationFailedError with a clear reason."""
    if spec.target_date is not None:
        if spec.target_date <= today:
            raise ValidationFailedError("The target date must be in the future.")
        if (spec.target_date - today).days > MAX_GOAL_HORIZON_DAYS:
            raise ValidationFailedError("The target date must be within 3 years.")

    if spec.goal_type in WEIGHT_GOALS:
        _validate_weight_goal(spec, current_weight_kg)
    elif spec.target_weight_kg is not None and spec.goal_type is not GoalType.RECOMPOSITION:
        raise ValidationFailedError("A target weight only applies to weight goals.")

    if spec.goal_type is GoalType.ENDURANCE_EVENT:
        if spec.sport not in ENDURANCE_SPORTS:
            raise ValidationFailedError(
                "An endurance event needs a sport: running, cycling, swimming or triathlon."
            )
        if spec.target_date is None:
            raise ValidationFailedError("An endurance event needs a target date.")
    elif spec.event_distance_km is not None:
        raise ValidationFailedError("An event distance only applies to endurance events.")

    if spec.goal_type is GoalType.MOUNTAIN_SPORT and spec.sport not in MOUNTAIN_SPORTS:
        raise ValidationFailedError(
            "A mountain goal needs a sport: hiking, ski touring, alpine skiing or climbing."
        )


def _validate_weight_goal(spec: GoalSpec, current_weight_kg: float | None) -> None:
    target = spec.target_weight_kg
    if target is None:
        raise ValidationFailedError("A weight goal needs a target weight.")
    if not MIN_WEIGHT_KG <= target <= MAX_WEIGHT_KG:
        raise ValidationFailedError(
            f"The target weight must be between {MIN_WEIGHT_KG:.0f} and {MAX_WEIGHT_KG:.0f} kg."
        )
    if current_weight_kg is None:
        return
    if spec.goal_type is GoalType.LOSE_WEIGHT and target >= current_weight_kg:
        raise ValidationFailedError("To lose weight, the target must be below your current weight.")
    if spec.goal_type is GoalType.GAIN_WEIGHT and target <= current_weight_kg:
        raise ValidationFailedError("To gain weight, the target must be above your current weight.")


@dataclass(frozen=True, slots=True)
class AthleteSnapshot:
    """What other modules may know about an athlete: body data, time zone and main goal.

    A plain value, so other modules never touch the profile module's tables.
    """

    birth_year: int
    sex: Sex
    height_cm: float
    weight_kg: float
    timezone: str
    primary_goal: GoalType | None
