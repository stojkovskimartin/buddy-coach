from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.workouts.domain import ActivityType, WorkoutSource
from buddy_coach.workouts.fit import activity_for, workouts_from_fit
from tests.support import FIT_RUN as RUN
from tests.support import FIT_START as START
from tests.support import fit_file


def test_a_watch_session_becomes_a_workout() -> None:
    [workout] = workouts_from_fit(fit_file(RUN))
    assert workout.source is WorkoutSource.FIT_FILE
    assert (workout.activity, workout.started_at, workout.duration_min) == (
        ActivityType.TRAIL_RUNNING,
        START,
        49.2,
    )
    assert (workout.distance_km, workout.elevation_gain_m) == (10.2, 120)
    assert (workout.avg_hr, workout.max_hr, workout.kcal) == (152, 175, 720)


def test_the_same_file_gives_the_same_ids_and_each_session_its_own() -> None:
    bike = {
        **RUN,
        "sport": "cycling",
        "sub_sport": "indoor_cycling",
        "start_time": START + timedelta(hours=2),
    }
    first = workouts_from_fit(fit_file(RUN, bike))
    again = workouts_from_fit(fit_file(RUN, bike))
    assert [w.external_id for w in first] == [w.external_id for w in again]
    assert len({w.external_id for w in first}) == 2
    assert first[1].activity is ActivityType.INDOOR_CYCLING


def test_sports_map_with_sub_sports_first_and_other_as_fallback() -> None:
    assert activity_for("training", "strength_training") is ActivityType.STRENGTH
    assert activity_for("alpine_skiing", "backcountry") is ActivityType.SKI_TOURING
    assert activity_for("alpine_skiing", "generic") is ActivityType.ALPINE_SKIING
    assert activity_for("sailing", None) is ActivityType.OTHER


def test_other_files_are_refused() -> None:
    with pytest.raises(ValidationFailedError, match="not a FIT file"):
        workouts_from_fit(b"<gpx></gpx>")
    with pytest.raises(ValidationFailedError, match="damaged"):
        workouts_from_fit(fit_file(RUN)[:-8])
    with pytest.raises(ValidationFailedError, match="no activity"):
        workouts_from_fit(fit_file())
    with pytest.raises(ValidationFailedError, match="not plausible"):
        workouts_from_fit(fit_file({**RUN, "avg_heart_rate": 250}))


def test_a_re_export_of_the_same_activity_keeps_its_ids() -> None:
    first = workouts_from_fit(fit_file(RUN))
    exported_again = workouts_from_fit(fit_file({**RUN, "total_calories": 721}))  # other bytes
    assert first[0].external_id == exported_again[0].external_id


def test_too_many_sessions_and_unset_clocks() -> None:
    with pytest.raises(ValidationFailedError, match="at most 500 sessions"):
        workouts_from_fit(fit_file(*[RUN] * 501))
    unset = {**RUN, "start_time": datetime(1989, 12, 31, tzinfo=START.tzinfo)}
    with pytest.raises(ValidationFailedError, match="no activity"):
        workouts_from_fit(fit_file(unset))
