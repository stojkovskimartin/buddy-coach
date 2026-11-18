"""Shared FastAPI dependencies for settings, the event bus and the clock."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

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


Clock = Callable[[], datetime]
"""Returns the current time (timezone-aware). Tests override it with a fixed instant."""


def _utc_now() -> datetime:
    return datetime.now(UTC)


def get_clock() -> Clock:
    """The clock used for "today" decisions; override in tests to freeze time."""
    return _utc_now
