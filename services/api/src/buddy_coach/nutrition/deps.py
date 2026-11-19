"""Dependencies for the nutrition module."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.db import get_session
from buddy_coach.core.deps import Clock, get_clock, get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.nutrition.service import NutritionService
from buddy_coach.profile.service import ProfileService


def get_nutrition_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> NutritionService:
    """Build the nutrition service for one request."""
    return NutritionService(ProfileService(session, events), now=clock)


NutritionServiceDep = Annotated[NutritionService, Depends(get_nutrition_service)]
