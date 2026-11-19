from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest

from buddy_coach.core.clock import local_date
from buddy_coach.nutrition.domain import energy_goal, estimated_training_kcal, targets_for
from buddy_coach.nutrition.service import NutritionService
from buddy_coach.profile.domain import AthleteSnapshot, GoalType, Sex
from buddy_coach.science.nutrition import WATCH_ENERGY_DISCOUNT, EnergyGoal

TODAY = date(2026, 11, 19)


def _athlete(goal: GoalType | None, **overrides: object) -> AthleteSnapshot:
    values: dict[str, object] = {
        "birth_year": 1998,
        "sex": Sex.MALE,
        "height_cm": 182,
        "weight_kg": 79,
        "timezone": "Europe/Zurich",
        "available_days_per_week": 5,
        "minutes_per_session": 60,
        "primary_goal": goal,
    }
    values.update(overrides)
    return AthleteSnapshot(**values)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("goal", "expected"),
    [
        (GoalType.LOSE_WEIGHT, EnergyGoal.LOSE),
        (GoalType.GAIN_WEIGHT, EnergyGoal.GAIN),
        (GoalType.ENDURANCE_EVENT, EnergyGoal.MAINTAIN),
        (None, EnergyGoal.MAINTAIN),
    ],
)
def test_goal_sets_the_energy_direction(goal: GoalType | None, expected: EnergyGoal) -> None:
    assert energy_goal(goal) is expected


def test_training_energy_comes_from_the_planned_week() -> None:
    # 5 x 60 min = ~43 min a day at 6 MET for 79 kg: (6-1) x 3.5 x 79 x 5 / 1000 = 6.9 kcal/min.
    assert estimated_training_kcal(79, 5, 60) == pytest.approx(296, abs=1)
    assert estimated_training_kcal(79, 0, 60) == 0
    # Available time is capped at 180 min a day, so 7 x 600 min counts like 7 x 180.
    assert estimated_training_kcal(79, 7, 600) == estimated_training_kcal(79, 7, 180)


def test_planned_training_raises_the_targets_and_is_explained() -> None:
    _, rest = targets_for(_athlete(None, available_days_per_week=0), TODAY)
    _, trained = targets_for(_athlete(None), TODAY)
    # The engine discounts training energy (it is often overestimated).
    expected = estimated_training_kcal(79, 5, 60) * WATCH_ENERGY_DISCOUNT
    assert trained.kcal - rest.kcal == pytest.approx(expected, abs=2)
    assert "available training time (43 min a day" in trained.reasons[-1]


def test_losing_weight_eats_below_maintenance_and_keeps_protein_high() -> None:
    _, maintain = targets_for(_athlete(None), TODAY)
    goal, lose = targets_for(_athlete(GoalType.LOSE_WEIGHT), TODAY)
    assert goal is EnergyGoal.LOSE
    assert lose.kcal < maintain.kcal == maintain.maintenance_kcal
    assert lose.protein_g > maintain.protein_g


def test_safety_floor_is_applied_and_explained() -> None:
    small = _athlete(
        GoalType.LOSE_WEIGHT,
        sex=Sex.FEMALE,
        weight_kg=42,
        height_cm=150,
        available_days_per_week=1,
        minutes_per_session=10,
    )
    _, t = targets_for(small, TODAY)
    assert t.floor_applied
    assert t.kcal >= 1200
    assert any("safe minimum" in r for r in t.reasons)


def test_macros_add_up_to_the_calories() -> None:
    _, t = targets_for(_athlete(GoalType.GAIN_WEIGHT), TODAY)
    assert abs(t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9 - t.kcal) <= 15


@pytest.mark.parametrize(
    ("timezone", "now", "expected"),
    [
        ("Europe/Zurich", datetime(2026, 11, 18, 23, 30, tzinfo=UTC), date(2026, 11, 19)),
        ("America/New_York", datetime(2026, 11, 19, 3, 0, tzinfo=UTC), date(2026, 11, 18)),
        (None, datetime(2026, 11, 18, 23, 30, tzinfo=UTC), date(2026, 11, 18)),
    ],
)
def test_local_date(timezone: str | None, now: datetime, expected: date) -> None:
    assert local_date(now, timezone) == expected


class FakeAthletes:
    def __init__(self, athlete: AthleteSnapshot | None) -> None:
        self._athlete = athlete

    async def athlete_snapshot(self, user_id: uuid.UUID) -> AthleteSnapshot | None:
        return self._athlete


async def test_targets_use_the_athletes_day_and_birthday() -> None:
    # 03:00 UTC on 1 Jan is still 31 Dec in New York: the athlete born in 1998 is 28, not 29.
    athlete = _athlete(None, timezone="America/New_York")
    service = NutritionService(
        FakeAthletes(athlete), now=lambda: datetime(2027, 1, 1, 3, 0, tzinfo=UTC)
    )
    out = await service.targets_today(uuid.uuid4())
    assert out.day == date(2026, 12, 31)
    _, expected = targets_for(athlete, date(2026, 12, 31))
    assert out.kcal == expected.kcal
    assert out.training_kcal_estimated
