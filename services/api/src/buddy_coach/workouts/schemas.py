"""Public request/response models of the workouts module."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from buddy_coach.science.training import RampVerdict
from buddy_coach.workouts.domain import MAX_IMPORT_BATCH, ActivityType, LoadSource, WorkoutSource


class WorkoutData(BaseModel):
    """What a device, an app or the athlete reports about a session."""

    activity: ActivityType
    started_at: AwareDatetime = Field(description="Start time with its UTC offset")
    duration_min: float = Field(gt=0, le=1440)
    distance_km: float | None = Field(default=None, ge=0, le=1000)
    elevation_gain_m: float | None = Field(default=None, ge=0, le=10000)
    avg_hr: float | None = Field(default=None, ge=30, le=230)
    max_hr: float | None = Field(default=None, ge=30, le=240)
    kcal: float | None = Field(default=None, ge=0, le=20000)
    rpe: float | None = Field(
        default=None, ge=1, le=10, description="Effort 1 (very easy) - 10 (max)"
    )
    feeling: int | None = Field(default=None, ge=1, le=5, description="1 = awful, 5 = great")
    pain: bool | None = Field(default=None, description="Pain (not normal soreness) in or after it")

    @model_validator(mode="after")
    def _max_not_below_average(self) -> WorkoutData:
        if self.avg_hr is not None and self.max_hr is not None and self.max_hr < self.avg_hr:
            raise ValueError("max_hr cannot be below avg_hr")
        return self


class ImportedWorkout(WorkoutData):
    """A session from a device or app, identified by that source's own id."""

    source: WorkoutSource
    external_id: str = Field(min_length=1, max_length=128)


class ImportIn(BaseModel):
    """A batch from one sync. Sending the same workouts again updates them, never duplicates."""

    workouts: list[ImportedWorkout] = Field(min_length=1, max_length=MAX_IMPORT_BATCH)


class ImportResult(BaseModel):
    """How many workouts were new and how many were updated."""

    created: int
    updated: int


class FeedbackIn(BaseModel):
    """How the session felt. Only the fields sent are changed."""

    rpe: float | None = Field(default=None, ge=1, le=10)
    feeling: int | None = Field(default=None, ge=1, le=5)
    pain: bool | None = None


class WorkoutOut(BaseModel):
    """A stored workout with its training load."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: WorkoutSource
    activity: ActivityType
    started_at: datetime
    day: date
    duration_min: float
    distance_km: float | None
    elevation_gain_m: float | None
    avg_hr: float | None
    max_hr: float | None
    kcal: float | None
    rpe: float | None
    feeling: int | None
    pain: bool
    load: float
    load_source: LoadSource


class DayLoadOut(BaseModel):
    """Training load, fitness, fatigue and form of one day."""

    day: date
    load: float
    fitness: float
    fatigue: float
    form: float


class RampOut(BaseModel):
    """This week's load (last 7 days) against the week before."""

    last_week_load: float
    this_week_load: float
    max_allowed_load: float
    verdict: RampVerdict


class LoadOut(BaseModel):
    """Where the athlete's training stands today, and the days that led there."""

    today: DayLoadOut
    acute_chronic_ratio: float | None = Field(
        description="Fatigue / fitness; above 1.5 load is rising faster than the body adapts"
    )
    ramp: RampOut
    days: list[DayLoadOut]
