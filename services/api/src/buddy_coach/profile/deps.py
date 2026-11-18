"""Dependencies for the profile module."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.db import get_session
from buddy_coach.core.deps import get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.profile.service import ProfileService


def get_profile_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
) -> ProfileService:
    """Build the profile service for one request."""
    return ProfileService(session, events)


ProfileServiceDep = Annotated[ProfileService, Depends(get_profile_service)]
