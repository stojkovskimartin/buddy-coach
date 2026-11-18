"""Dependencies for the check-in module."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.checkin.service import CheckinService
from buddy_coach.core.db import get_session
from buddy_coach.core.deps import Clock, get_clock, get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.profile.service import ProfileService


def get_checkin_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> CheckinService:
    """Build the check-in service for one request (sharing the request's session)."""
    return CheckinService(session, events, ProfileService(session, events), now=clock)


CheckinServiceDep = Annotated[CheckinService, Depends(get_checkin_service)]
