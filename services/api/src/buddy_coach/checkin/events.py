"""Events published by the check-in module."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from buddy_coach.core.events import DomainEvent


@dataclass(frozen=True, kw_only=True)
class CheckinSaved(DomainEvent):
    """A daily check-in was created or changed (today's plan may need adapting)."""

    user_id: uuid.UUID
    day: date
