"""Dependencies other modules use to get the authenticated user."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.config import Settings
from buddy_coach.core.db import get_session
from buddy_coach.core.deps import get_app_settings, get_event_bus
from buddy_coach.core.errors import AuthenticationError
from buddy_coach.core.events import EventBus
from buddy_coach.identity.schemas import CurrentUser
from buddy_coach.identity.service import IdentityService

_bearer = HTTPBearer(auto_error=False)


def get_identity_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    events: Annotated[EventBus, Depends(get_event_bus)],
) -> IdentityService:
    """Build the identity service for one request."""
    return IdentityService(session, settings, events)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    service: Annotated[IdentityService, Depends(get_identity_service)],
) -> CurrentUser:
    """Require a valid bearer access token."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError("Missing bearer token.")
    return await service.authenticate_access_token(credentials.credentials)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
