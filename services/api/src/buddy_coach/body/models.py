"""Tables owned by the body module (no foreign keys to other modules, ADR-0002)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    Index,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from buddy_coach.body.domain import WeightSource
from buddy_coach.core.db import Base, TimestampMixin
from buddy_coach.profile.domain import MAX_WEIGHT_KG, MIN_WEIGHT_KG


class BodyWeight(TimestampMixin, Base):
    """One weight measurement. (user, source, external_id) is unique, so re-syncs update.

    ``day`` is the athlete's calendar day when it was stored, like workouts.
    """

    __tablename__ = "body_weights"
    __table_args__ = (
        UniqueConstraint("user_id", "source", "external_id", name="uq_body_weights_source_id"),
        Index("ix_body_weights_user_day", "user_id", "day"),
        Index("ix_body_weights_user_measured_at", "user_id", "measured_at"),
        CheckConstraint(
            f"weight_kg >= {MIN_WEIGHT_KG} AND weight_kg <= {MAX_WEIGHT_KG}", name="weight_kg"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    source: Mapped[WeightSource] = mapped_column(
        Enum(
            WeightSource,
            name="weight_source",
            native_enum=False,
            length=32,
            values_callable=lambda cls: [str(m.value) for m in cls],
        )
    )
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
