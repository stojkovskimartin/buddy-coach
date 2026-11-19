"""Dependencies for the body module."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.body.service import BodyService
from buddy_coach.core.db import get_session
from buddy_coach.core.deps import Clock, get_clock, get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.profile.service import ProfileService


def get_body_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> BodyService:
    """Build the body service for one request (the profile service shares its session)."""
    return BodyService(session, events, ProfileService(session, events), now=clock)


BodyServiceDep = Annotated[BodyService, Depends(get_body_service)]
