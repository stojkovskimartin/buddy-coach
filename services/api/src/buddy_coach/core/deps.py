"""Shared FastAPI dependencies for settings and the event bus."""

from __future__ import annotations

from fastapi import Request

from buddy_coach.core.config import Settings
from buddy_coach.core.events import EventBus


def get_app_settings(request: Request) -> Settings:
    """Settings of the running app (overridable in tests via app creation)."""
    settings: Settings = request.app.state.settings
    return settings


def get_event_bus(request: Request) -> EventBus:
    """The application's event bus."""
    bus: EventBus = request.app.state.event_bus
    return bus
