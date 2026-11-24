"""Tables owned by the profile module.

``user_id`` refers to an identity user but has no foreign key: modules do not couple
their schemas (ADR-0002). Account deletion erases the rows through ``ProfileService.erase_user``.
"""

from __future__ import annotations

import uuid
from datetime import date
from enum import Enum as PyEnum

from sqlalchemy import Date, Enum, Float, Index, Integer, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from buddy_coach.core.db import Base, TimestampMixin
from buddy_coach.profile.domain import (
    CoachStyle,
    ExperienceLevel,
    GoalPriority,
    GoalStatus,
    GoalType,
    Sex,
    Sport,
)


def _enum(enum_cls: type[PyEnum], name: str) -> Enum:
    # Store enum values (not names) as plain strings: portable and readable in SQL.
    return Enum(enum_cls, name=name, native_enum=False, length=32, values_callable=_values)


def _values(enum_cls: type[PyEnum]) -> list[str]:
    return [str(member.value) for member in enum_cls]


class Profile(TimestampMixin, Base):
    """Body data and preferences of one user."""

    __tablename__ = "profile_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    birth_year: Mapped[int] = mapped_column(Integer, nullable=False)
    sex: Mapped[Sex] = mapped_column(_enum(Sex, "sex"), nullable=False)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    experience: Mapped[ExperienceLevel] = mapped_column(
        _enum(ExperienceLevel, "experience_level"), nullable=False
    )
    coach_style: Mapped[CoachStyle] = mapped_column(
        _enum(CoachStyle, "coach_style"), nullable=False
    )
    available_days_per_week: Mapped[int] = mapped_column(Integer, nullable=False)
    minutes_per_session: Mapped[int] = mapped_column(Integer, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False)


class Goal(TimestampMixin, Base):
    """A goal the user is working towards."""

    __tablename__ = "profile_goals"
    __table_args__ = (
        # The database guarantees what the service enforces: one active primary goal per user.
        Index(
            "uq_profile_goals_one_active_primary",
            "user_id",
            unique=True,
            postgresql_where=text("priority = 'primary' AND status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    goal_type: Mapped[GoalType] = mapped_column(_enum(GoalType, "goal_type"), nullable=False)
    sport: Mapped[Sport | None] = mapped_column(_enum(Sport, "sport"), nullable=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    event_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[GoalPriority] = mapped_column(
        _enum(GoalPriority, "goal_priority"), nullable=False
    )
    status: Mapped[GoalStatus] = mapped_column(_enum(GoalStatus, "goal_status"), nullable=False)
