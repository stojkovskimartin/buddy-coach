"""What every provider client offers the integrations service."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from buddy_coach.body.schemas import ImportedWeight
from buddy_coach.workouts.schemas import ImportedWorkout


@dataclass(frozen=True, slots=True)
class Tokens:
    """A fresh token pair. Providers rotate the refresh token on every refresh."""

    access_token: str
    refresh_token: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class Pulled:
    """Data from one sync and the cursor to continue from next time."""

    cursor: int | None
    skipped: int = 0
    """Records left out by the client (unusable data)."""
    weights: list[ImportedWeight] = field(default_factory=list)
    workouts: list[ImportedWorkout] = field(default_factory=list)


class ProviderClient(Protocol):
    """OAuth and data access of one provider. Codes, tokens and responses are never logged."""

    def authorize_url(self, state: str) -> str:
        """The provider's consent page."""
        ...

    async def exchange(self, code: str, now: datetime) -> Tokens:
        """Trade the one-time code for tokens."""
        ...

    async def refresh(self, refresh_token: str, now: datetime) -> Tokens:
        """A new token pair."""
        ...

    async def pull(self, access_token: str, now: datetime, cursor: int | None) -> Pulled:
        """Everything new since ``cursor`` (None: the first sync)."""
        ...
