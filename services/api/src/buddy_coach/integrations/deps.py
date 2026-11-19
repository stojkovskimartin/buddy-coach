"""Dependencies for the integrations module."""

from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.body.service import BodyService
from buddy_coach.core.config import Settings
from buddy_coach.core.db import get_session
from buddy_coach.core.deps import Clock, get_app_settings, get_clock, get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.integrations.service import IntegrationsService
from buddy_coach.integrations.withings import WithingsClient
from buddy_coach.profile.service import ProfileService


def get_withings_client(
    request: Request, settings: Annotated[Settings, Depends(get_app_settings)]
) -> WithingsClient | None:
    """The Withings app of this server, or None when it is not set up."""
    secret = settings.withings_client_secret
    if not settings.withings_client_id or secret is None:
        return None
    http: httpx.AsyncClient = request.app.state.http
    return WithingsClient(
        http, settings.withings_client_id, secret.get_secret_value(), settings.oauth_redirect_url
    )


def get_integrations_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    withings: Annotated[WithingsClient | None, Depends(get_withings_client)],
) -> IntegrationsService:
    """Build the service for one request; weights go through the body module's service."""
    body = BodyService(session, events, ProfileService(session, events), now=clock)
    return IntegrationsService(session, settings, withings, body, now=clock)


IntegrationsServiceDep = Annotated[IntegrationsService, Depends(get_integrations_service)]
