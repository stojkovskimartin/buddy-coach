"""Reading WHOOP workouts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from buddy_coach.integrations.whoop import workout_from_whoop

NOW = datetime(2026, 11, 19, 7, 0, tzinfo=UTC)


def _record(**fields: Any) -> dict[str, Any]:
    record: dict[str, Any] = {
        "id": "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
        "start": "2026-11-18T17:00:00.000Z",
        "end": "2026-11-18T17:45:30.000Z",
        "sport_name": "running",
        "score_state": "SCORED",
        "score": {
            "average_heart_rate": 148,
            "max_heart_rate": 176,
            "kilojoule": 2510.4,
            "distance_meter": 8412.5,
            "altitude_gain_meter": 64.2,
        },
    }
    record.update(fields)
    return record


def test_a_scored_workout_is_imported_with_its_measurements() -> None:
    workout = workout_from_whoop(_record(), NOW)

    assert workout is not None
    assert (workout.source, workout.external_id, workout.activity) == (
        "whoop",
        "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
        "running",
    )
    assert workout.started_at == datetime(2026, 11, 18, 17, 0, tzinfo=UTC)
    assert workout.duration_min == 45.5
    assert (workout.distance_km, workout.elevation_gain_m) == (8.412, 64.2)
    assert (workout.avg_hr, workout.max_hr, workout.kcal) == (148, 176, 600)


def test_unscored_workouts_come_without_measurements_and_unknown_sports_are_other() -> None:
    workout = workout_from_whoop(_record(score_state="PENDING_SCORE", sport_name="Pickleball"), NOW)

    assert workout is not None
    assert workout.activity == "other"
    assert (workout.avg_hr, workout.kcal, workout.distance_km) == (None, None, None)


def test_implausible_measurements_are_left_out_instead_of_failing() -> None:
    score = {
        "average_heart_rate": 150,
        "max_heart_rate": 140,  # below the average
        "kilojoule": -5,
        "distance_meter": 5_000_000,
        "altitude_gain_meter": -12,
    }
    workout = workout_from_whoop(_record(score=score, sport_name="functional-fitness"), NOW)

    assert workout is not None
    assert workout.activity == "strength"
    assert (workout.avg_hr, workout.max_hr) == (150, None)
    assert (workout.kcal, workout.distance_km, workout.elevation_gain_m) == (None, None, None)


def test_unusable_workouts_are_skipped() -> None:
    unusable = [
        _record(id=None),
        _record(start="yesterday"),
        _record(start="2026-11-18T17:00:00", end="2026-11-18T18:00:00"),  # no time zone
        _record(end="2026-11-18T16:00:00Z"),  # ends before it starts
        _record(end="2026-11-20T18:00:00Z"),  # longer than a day
        _record(start="2026-11-19T09:00:00Z", end="2026-11-19T10:00:00Z"),  # in the future
        _record(end="2026-11-18T17:00:02Z"),  # 2 seconds
        _record(end="2026-11-18T18:00:00"),  # time zone on one end only
    ]
    assert [workout_from_whoop(r, NOW) for r in unusable] == [None] * len(unusable)
