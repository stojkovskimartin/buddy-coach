"""Tables owned by the meals module (no foreign keys to other modules, ADR-0002)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, Float, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from buddy_coach.core.db import Base, TimestampMixin
from buddy_coach.meals.domain import MAX_GRAMS, FoodSource, MealSlot


def _enum(enum_cls: type, name: str) -> Enum:
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        length=32,
        values_callable=lambda cls: [str(m.value) for m in cls],
    )


class MealEntry(TimestampMixin, Base):
    """One food in the diary with the nutrients of the portion eaten.

    ``day`` is the athlete's calendar day when it was stored, like workouts and weights.
    """

    __tablename__ = "meals_entries"
    __table_args__ = (
        Index("ix_meals_entries_user_day", "user_id", "day"),
        CheckConstraint(f"grams > 0 AND grams <= {MAX_GRAMS}", name="grams"),
        CheckConstraint(
            "kcal >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0", name="nutrients"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    eaten_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    meal: Mapped[MealSlot] = mapped_column(_enum(MealSlot, "meal_slot"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    grams: Mapped[float] = mapped_column(Float, nullable=False)
    kcal: Mapped[float] = mapped_column(Float, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[FoodSource] = mapped_column(_enum(FoodSource, "food_source"))
    barcode: Mapped[str | None] = mapped_column(String(32), nullable=True)
