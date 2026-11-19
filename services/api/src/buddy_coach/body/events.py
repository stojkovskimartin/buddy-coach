"""Events published by the body module."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from buddy_coach.core.events import DomainEvent


@dataclass(frozen=True, kw_only=True)
class BodyWeightChanged(DomainEvent):
    """Weights were added, changed or removed from ``first_day`` on (targets may change)."""

    user_id: uuid.UUID
    first_day: date
