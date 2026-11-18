"""Events published by the profile module."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from buddy_coach.core.events import DomainEvent


@dataclass(frozen=True, kw_only=True)
class ProfileUpdated(DomainEvent):
    """Body data or preferences changed (nutrition targets may need recalculation)."""

    user_id: uuid.UUID


@dataclass(frozen=True, kw_only=True)
class GoalChanged(DomainEvent):
    """A goal was created or changed status (plans and targets may need updating)."""

    user_id: uuid.UUID
    goal_id: uuid.UUID
