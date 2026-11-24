"""Public request/response models of the profile module."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, Field, field_validator

from buddy_coach.profile.domain import (
    MAX_WEIGHT_KG,
    MIN_WEIGHT_KG,
    CoachStyle,
    ExperienceLevel,
    GoalPriority,
    GoalStatus,
    GoalType,
    Sex,
    Sport,
)

_TIMEZONES = frozenset(available_timezones())


class ProfileIn(BaseModel):
    """Create or replace the profile."""

    birth_year: int = Field(ge=1920, le=2100)
    sex: Sex
    height_cm: float = Field(ge=100, le=250)
    weight_kg: float = Field(ge=MIN_WEIGHT_KG, le=MAX_WEIGHT_KG)
    experience: ExperienceLevel
    coach_style: CoachStyle = CoachStyle.FRIENDLY
    available_days_per_week: int = Field(ge=1, le=7)
    minutes_per_session: int = Field(ge=10, le=600)
    timezone: str = "Europe/Zurich"
    locale: str = Field(default="en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        if value not in _TIMEZONES:
            msg = "Unknown timezone"
            raise ValueError(msg)
        return value


class ProfileOut(ProfileIn):
    """The stored profile."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    updated_at: datetime


class GoalIn(BaseModel):
    """Create a goal."""

    goal_type: GoalType
    title: str = Field(min_length=1, max_length=120)
    sport: Sport | None = None
    target_weight_kg: float | None = Field(default=None, ge=MIN_WEIGHT_KG, le=MAX_WEIGHT_KG)
    event_distance_km: float | None = Field(default=None, gt=0, le=10_000)
    target_date: date | None = None
    priority: GoalPriority = GoalPriority.PRIMARY


class GoalStatusUpdate(BaseModel):
    """Change a goal's status."""

    status: GoalStatus


class GoalOut(BaseModel):
    """A stored goal."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    goal_type: GoalType
    title: str
    sport: Sport | None
    target_weight_kg: float | None
    event_distance_km: float | None
    target_date: date | None
    priority: GoalPriority
    status: GoalStatus
    created_at: datetime


class ProfileExport(BaseModel):
    """The user's profile (None before onboarding) and all goals, for the data export."""

    profile: ProfileOut | None
    goals: list[GoalOut]
