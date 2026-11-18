"""Tables owned by the check-in module (no foreign keys to other modules, ADR-0002)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, Float, SmallInteger, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from buddy_coach.core.db import Base, TimestampMixin


class DailyCheckin(TimestampMixin, Base):
    """One morning check-in per user and local calendar day."""

    __tablename__ = "checkin_daily"
    __table_args__ = (
        CheckConstraint("sleep_quality BETWEEN 1 AND 5", name="sleep_quality"),
        CheckConstraint("soreness BETWEEN 1 AND 5", name="soreness"),
        CheckConstraint("mood BETWEEN 1 AND 5", name="mood"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    sleep_quality: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    soreness: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    mood: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    hrv_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    resting_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    pain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
