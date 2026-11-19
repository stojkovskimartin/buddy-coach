"""Nutrition use cases."""

from __future__ import annotations

import uuid
from datetime import UTC
from typing import Protocol
from zoneinfo import ZoneInfo

from buddy_coach.core.deps import Clock
from buddy_coach.core.errors import NotFoundError
from buddy_coach.nutrition.domain import targets_for
from buddy_coach.nutrition.schemas import TargetsOut
from buddy_coach.profile.domain import AthleteSnapshot

ONBOARDING_NEEDED = "Complete your profile first, so the coach can calculate your targets."


class AthleteLookup(Protocol):
    """What the nutrition module needs from the profile module."""

    async def athlete_snapshot(self, user_id: uuid.UUID) -> AthleteSnapshot | None: ...


class NutritionService:
    """Read-only for now: no transactions."""

    def __init__(self, athletes: AthleteLookup, now: Clock) -> None:
        self._athletes = athletes
        self._now = now

    async def targets_today(self, user_id: uuid.UUID) -> TargetsOut:
        """Today's targets (the athlete's day); NotFoundError before onboarding."""
        athlete = await self._athletes.athlete_snapshot(user_id)
        if athlete is None:
            raise NotFoundError(ONBOARDING_NEEDED)
        today = (
            self._now().astimezone(ZoneInfo(athlete.timezone) if athlete.timezone else UTC).date()
        )
        goal, targets = targets_for(athlete, today)
        return TargetsOut(
            day=today,
            goal=goal,
            kcal=targets.kcal,
            protein_g=targets.protein_g,
            carbs_g=targets.carbs_g,
            fat_g=targets.fat_g,
            maintenance_kcal=targets.maintenance_kcal,
            floor_applied=targets.floor_applied,
            reasons=list(targets.reasons),
        )
