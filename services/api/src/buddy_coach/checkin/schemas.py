"""Public request/response models of the check-in module."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from buddy_coach.science.training import ReadinessLevel


class CheckinIn(BaseModel):
    """The morning check-in. Self-reports use 1 (bad) to 5 (great); device values are optional."""

    sleep_quality: int = Field(ge=1, le=5, description="1 = very poor, 5 = excellent")
    soreness: int = Field(ge=1, le=5, description="1 = very sore, 5 = not sore at all")
    mood: int = Field(ge=1, le=5, description="1 = very low, 5 = great")
    sleep_hours: float | None = Field(default=None, ge=0, le=16)
    hrv_ms: float | None = Field(default=None, gt=0, le=300, description="Overnight HRV (RMSSD)")
    resting_hr: float | None = Field(default=None, ge=25, le=150, description="Beats per minute")
    pain: bool = Field(default=False, description="Pain (not normal muscle soreness) today")


class ReadinessOut(BaseModel):
    """Today's readiness: 0-100, a traffic light and what pulled it down."""

    score: int
    level: ReadinessLevel
    limiting_factors: list[str]


class CheckinOut(CheckinIn):
    """A saved check-in with the readiness computed for that day."""

    model_config = ConfigDict(from_attributes=True)

    day: date
    readiness: ReadinessOut
