from __future__ import annotations

from datetime import date

import pytest

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.profile.domain import (
    GoalSpec,
    GoalType,
    Sport,
    age_on,
    validate_adult,
    validate_goal,
)

TODAY = date(2026, 11, 18)


@pytest.mark.parametrize(
    ("birth_year", "today", "expected"),
    [
        (1998, date(2026, 11, 18), 28),
        (1998, date(2026, 3, 1), 27),  # before the assumed mid-year birthday
        (2008, date(2026, 7, 1), 18),
    ],
)
def test_age_on(birth_year: int, today: date, expected: int) -> None:
    assert age_on(birth_year, today) == expected


def test_validate_adult_rejects_minors() -> None:
    with pytest.raises(ValidationFailedError, match="18 and over"):
        validate_adult(2010, TODAY)


def test_validate_adult_accepts_adults() -> None:
    validate_adult(1990, TODAY)


@pytest.mark.parametrize(
    "spec",
    [
        GoalSpec(goal_type=GoalType.LOSE_WEIGHT, target_weight_kg=72),
        GoalSpec(goal_type=GoalType.GAIN_WEIGHT, target_weight_kg=85),
        GoalSpec(
            goal_type=GoalType.ENDURANCE_EVENT,
            sport=Sport.TRIATHLON,
            target_date=date(2027, 6, 1),
            event_distance_km=113,
        ),
        GoalSpec(goal_type=GoalType.MOUNTAIN_SPORT, sport=Sport.SKI_TOURING),
        GoalSpec(goal_type=GoalType.GENERAL_FITNESS),
        GoalSpec(goal_type=GoalType.RECOMPOSITION, target_weight_kg=78),
    ],
)
def test_valid_goals_pass(spec: GoalSpec) -> None:
    validate_goal(spec, TODAY, current_weight_kg=79)


@pytest.mark.parametrize(
    ("spec", "message"),
    [
        (GoalSpec(goal_type=GoalType.LOSE_WEIGHT), "needs a target weight"),
        (GoalSpec(goal_type=GoalType.LOSE_WEIGHT, target_weight_kg=80), "below your current"),
        (GoalSpec(goal_type=GoalType.GAIN_WEIGHT, target_weight_kg=79), "above your current"),
        (GoalSpec(goal_type=GoalType.LOSE_WEIGHT, target_weight_kg=20), "between 30 and 300"),
        (GoalSpec(goal_type=GoalType.STRENGTH, target_weight_kg=70), "only applies to weight"),
        (
            GoalSpec(
                goal_type=GoalType.ENDURANCE_EVENT, sport=Sport.HIKING, target_date=date(2027, 1, 1)
            ),
            "needs a sport",
        ),
        (GoalSpec(goal_type=GoalType.ENDURANCE_EVENT, sport=Sport.RUNNING), "needs a target date"),
        (
            GoalSpec(goal_type=GoalType.GENERAL_FITNESS, event_distance_km=10),
            "only applies to endurance",
        ),
        (GoalSpec(goal_type=GoalType.MOUNTAIN_SPORT, sport=Sport.RUNNING), "mountain goal needs"),
        (GoalSpec(goal_type=GoalType.GENERAL_FITNESS, target_date=TODAY), "in the future"),
        (
            GoalSpec(goal_type=GoalType.GENERAL_FITNESS, target_date=date(2030, 1, 1)),
            "within 3 years",
        ),
    ],
)
def test_invalid_goals_fail_with_reason(spec: GoalSpec, message: str) -> None:
    with pytest.raises(ValidationFailedError, match=message):
        validate_goal(spec, TODAY, current_weight_kg=79)


def test_weight_direction_is_not_checked_without_current_weight() -> None:
    validate_goal(GoalSpec(goal_type=GoalType.LOSE_WEIGHT, target_weight_kg=90), TODAY, None)
