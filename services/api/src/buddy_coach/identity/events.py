"""Events published by the identity module."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from buddy_coach.core.events import DomainEvent


@dataclass(frozen=True, kw_only=True)
class UserRegistered(DomainEvent):
    """A new account was created."""

    user_id: uuid.UUID
