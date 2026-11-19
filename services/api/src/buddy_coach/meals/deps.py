"""Dependencies for the meals module."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.db import get_session
from buddy_coach.core.deps import Clock, get_clock, get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.meals.service import MealService
from buddy_coach.profile.service import ProfileService


def get_meal_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> MealService:
    """Build the meal service for one request."""
    return MealService(session, ProfileService(session, events), now=clock)


MealServiceDep = Annotated[MealService, Depends(get_meal_service)]
