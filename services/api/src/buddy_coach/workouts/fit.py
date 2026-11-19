"""Workouts from FIT files, the activity format of almost every sports watch (Garmin, Coros,
Polar, Suunto, Wahoo, ...), read with Garmin's official FIT SDK."""

from __future__ import annotations

import hashlib
import io
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from garmin_fit_sdk import Decoder, Stream

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.workouts.domain import MAX_IMPORT_BATCH, ActivityType, WorkoutSource
from buddy_coach.workouts.schemas import ImportedWorkout

MAX_FIT_BYTES = 10 * 1024 * 1024
EARLIEST = datetime(2000, 1, 1, tzinfo=UTC)
"""A start before this is an unset watch clock (FIT time 0 is 1989)."""

_SPORTS = {
    "running": ActivityType.RUNNING,
    "cycling": ActivityType.CYCLING,
    "e_biking": ActivityType.CYCLING,
    "swimming": ActivityType.SWIMMING,
    "walking": ActivityType.WALKING,
    "hiking": ActivityType.HIKING,
    "alpine_skiing": ActivityType.ALPINE_SKIING,
    "cross_country_skiing": ActivityType.CROSS_COUNTRY_SKIING,
    "rowing": ActivityType.ROWING,
    "rock_climbing": ActivityType.CLIMBING,
    "hiit": ActivityType.HIIT,
    "soccer": ActivityType.TEAM_SPORT,
    "basketball": ActivityType.TEAM_SPORT,
    "american_football": ActivityType.TEAM_SPORT,
}
_SUB_SPORTS = {
    ("running", "trail"): ActivityType.TRAIL_RUNNING,
    ("cycling", "indoor_cycling"): ActivityType.INDOOR_CYCLING,
    ("alpine_skiing", "backcountry"): ActivityType.SKI_TOURING,
    ("training", "strength_training"): ActivityType.STRENGTH,
    ("training", "hiit"): ActivityType.HIIT,
    ("training", "yoga"): ActivityType.YOGA,
    ("fitness_equipment", "indoor_rowing"): ActivityType.ROWING,
    ("fitness_equipment", "strength_training"): ActivityType.STRENGTH,
}


def activity_for(sport: Any, sub_sport: Any) -> ActivityType:
    """The activity of a FIT sport and sub-sport; anything unknown is 'other'."""
    return _SUB_SPORTS.get((sport, sub_sport)) or _SPORTS.get(sport, ActivityType.OTHER)


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and value > 0 else None


def _file_key(file_ids: Sequence[Mapping[str, Any]], data: bytes) -> str:
    """The watch's serial number and the file's creation time identify an activity even when it is
    exported again; files without them fall back to a hash of their content."""
    file_id = file_ids[0] if file_ids else {}
    serial, created = file_id.get("serial_number"), file_id.get("time_created")
    if isinstance(serial, int) and isinstance(created, datetime):
        return f"{serial}-{int(created.timestamp())}"
    return hashlib.sha256(data).hexdigest()[:40]


def workouts_from_fit(data: bytes) -> list[ImportedWorkout]:
    """One workout per session of a FIT activity file. Uploading the same activity again
    updates it instead of adding it twice."""
    stream = Stream.from_bytes_io(io.BytesIO(data))
    decoder = Decoder(stream)
    if not decoder.is_fit():
        raise ValidationFailedError("This is not a FIT file.")
    # Only sessions are used: skip the work that expands per-second records.
    messages, errors = decoder.read(expand_components=False, merge_heart_rates=False)
    if errors:
        raise ValidationFailedError("The FIT file is damaged.")
    sessions = messages.get("session_mesgs", [])
    if len(sessions) > MAX_IMPORT_BATCH:
        raise ValidationFailedError(f"A FIT file can hold at most {MAX_IMPORT_BATCH} sessions.")
    file_key = _file_key(messages.get("file_id_mesgs", []), data)
    workouts: list[ImportedWorkout] = []
    for index, session in enumerate(sessions):
        start = session.get("start_time")
        minutes = _number(session.get("total_timer_time") or session.get("total_elapsed_time"))
        if not isinstance(start, datetime) or start < EARLIEST or minutes is None:
            continue
        distance = _number(session.get("total_distance"))
        try:
            workouts.append(
                ImportedWorkout(
                    source=WorkoutSource.FIT_FILE,
                    external_id=f"{file_key}-{index}",
                    activity=activity_for(session.get("sport"), session.get("sub_sport")),
                    started_at=start if start.tzinfo else start.replace(tzinfo=UTC),
                    duration_min=round(minutes / 60, 1),
                    distance_km=round(distance / 1000, 2) if distance else None,
                    elevation_gain_m=_number(session.get("total_ascent")),
                    avg_hr=_number(session.get("avg_heart_rate")),
                    max_hr=_number(session.get("max_heart_rate")),
                    kcal=_number(session.get("total_calories")),
                )
            )
        except ValueError as exc:  # values outside what a workout can be
            raise ValidationFailedError(
                f"Session {index + 1} of the FIT file is not plausible."
            ) from exc
    if not workouts:
        raise ValidationFailedError(
            "The FIT file holds no activity (only activity files are read)."
        )
    return workouts
