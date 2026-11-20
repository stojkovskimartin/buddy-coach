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
from buddy_coach.integrations.clients import ProviderClient
from buddy_coach.integrations.domain import Provider
from buddy_coach.integrations.fake import FakeClient
from buddy_coach.integrations.service import IntegrationsService
from buddy_coach.integrations.whoop import WhoopClient
from buddy_coach.integrations.withings import WithingsClient
from buddy_coach.profile.service import ProfileService
from buddy_coach.workouts.service import WorkoutService


def get_provider_clients(
    request: Request, settings: Annotated[Settings, Depends(get_app_settings)]
) -> dict[Provider, ProviderClient]:
    """The providers this server has an app (client id and secret) for, plus stand-ins for the
    others when ``fake_providers`` is on."""
    http: httpx.AsyncClient = request.app.state.http
    redirect = settings.oauth_redirect_url
    clients: dict[Provider, ProviderClient] = {}
    if settings.withings_client_id and settings.withings_client_secret:
        clients[Provider.WITHINGS] = WithingsClient(
            http,
            settings.withings_client_id,
            settings.withings_client_secret.get_secret_value(),
            redirect,
        )
    if settings.whoop_client_id and settings.whoop_client_secret:
        clients[Provider.WHOOP] = WhoopClient(
            http,
            settings.whoop_client_id,
            settings.whoop_client_secret.get_secret_value(),
            redirect,
        )
    if settings.fake_providers:  # real keys win
        for provider in Provider:
            clients.setdefault(provider, FakeClient(provider, redirect))
    return clients


def get_integrations_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    clients: Annotated[dict[Provider, ProviderClient], Depends(get_provider_clients)],
) -> IntegrationsService:
    """Build the service for one request; data goes through the owning modules' services."""
    profiles = ProfileService(session, events)
    body = BodyService(session, events, profiles, now=clock)
    workouts = WorkoutService(session, events, profiles, now=clock)
    return IntegrationsService(session, settings, clients, body, workouts, now=clock)


IntegrationsServiceDep = Annotated[IntegrationsService, Depends(get_integrations_service)]
