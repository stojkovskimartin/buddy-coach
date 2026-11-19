"""Dependencies for the workouts module."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.db import get_session
from buddy_coach.core.deps import Clock, get_clock, get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.profile.service import ProfileService
from buddy_coach.workouts.service import WorkoutService


def get_workout_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> WorkoutService:
    """Build the workout service for one request."""
    return WorkoutService(session, events, ProfileService(session, events), now=clock)


WorkoutServiceDep = Annotated[WorkoutService, Depends(get_workout_service)]
