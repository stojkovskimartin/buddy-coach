"""Public request/response models of the body module."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from buddy_coach.body.domain import MAX_IMPORT_BATCH, WeightSource
from buddy_coach.profile.domain import MAX_WEIGHT_KG, MIN_WEIGHT_KG


class WeightIn(BaseModel):
    """A weight typed in by the athlete."""

    weight_kg: float = Field(ge=MIN_WEIGHT_KG, le=MAX_WEIGHT_KG)
    measured_at: AwareDatetime | None = Field(
        default=None, description="When it was measured, with its UTC offset; default now"
    )


class ImportedWeight(BaseModel):
    """A measurement from a phone health store, identified by that store's own id."""

    source: WeightSource
    external_id: str = Field(min_length=1, max_length=128)
    measured_at: AwareDatetime
    weight_kg: float = Field(
        gt=0,
        le=1000,
        description=f"Readings outside {MIN_WEIGHT_KG:g}-{MAX_WEIGHT_KG:g} kg are skipped",
    )

    @field_validator("source")
    @classmethod
    def _not_manual(cls, source: WeightSource) -> WeightSource:
        if source is WeightSource.MANUAL:
            raise ValueError("manual weights are logged with POST /body/weights")
        return source


class WeightImportIn(BaseModel):
    """A batch from one sync. Sending the same weights again updates them, never duplicates."""

    weights: list[ImportedWeight] = Field(min_length=1, max_length=MAX_IMPORT_BATCH)


class WeightImportResult(BaseModel):
    """New, updated and skipped (implausible) measurements."""

    created: int
    updated: int
    skipped: int


class WeightOut(BaseModel):
    """A stored measurement."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: WeightSource
    measured_at: datetime
    day: date
    weight_kg: float


class TrendPoint(BaseModel):
    """The smoothed weight of one day with a measurement."""

    day: date
    weight_kg: float


class WeightHistoryOut(BaseModel):
    """Measurements in a range (newest first) and the trend (oldest first)."""

    weights: list[WeightOut]
    trend: list[TrendPoint] = Field(
        description="Mean of the measured days in the 7 days up to each day; one value per day"
    )
