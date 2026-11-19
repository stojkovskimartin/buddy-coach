"""Tables owned by the workouts module (no foreign keys to other modules, ADR-0002)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from buddy_coach.core.db import Base, TimestampMixin
from buddy_coach.workouts.domain import ActivityType, LoadSource, WorkoutSource


def _enum(enum_cls: type, name: str) -> Enum:
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        length=32,
        values_callable=lambda cls: [str(m.value) for m in cls],
    )


class Workout(TimestampMixin, Base):
    """One training session. (user, source, external_id) is unique, so re-imports update.

    ``day`` is the athlete's calendar day when the workout was stored; a later change of the
    profile time zone does not move existing workouts.
    """

    __tablename__ = "workouts_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "source", "external_id", name="uq_workouts_sessions_source_id"),
        Index("ix_workouts_sessions_user_day", "user_id", "day"),
        CheckConstraint("duration_min > 0 AND duration_min <= 1440", name="duration"),
        CheckConstraint("rpe IS NULL OR rpe BETWEEN 1 AND 10", name="rpe"),
        CheckConstraint("feeling IS NULL OR feeling BETWEEN 1 AND 5", name="feeling"),
        CheckConstraint("load >= 0", name="load"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    source: Mapped[WorkoutSource] = mapped_column(_enum(WorkoutSource, "workout_source"))
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    activity: Mapped[ActivityType] = mapped_column(_enum(ActivityType, "activity_type"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    duration_min: Mapped[float] = mapped_column(Float, nullable=False)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation_gain_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    feeling: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    pain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    load: Mapped[float] = mapped_column(Float, nullable=False)
    load_source: Mapped[LoadSource] = mapped_column(_enum(LoadSource, "load_source"))
