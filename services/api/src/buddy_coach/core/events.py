"""Domain events and an in-process event bus.

The bus has the same publish/subscribe shape a message broker would have, so a module can
later move to its own service by swapping the bus implementation (ADR-0002).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


@dataclass(frozen=True, kw_only=True)
class DomainEvent:
    """Base class for events. Subclasses add their payload fields."""

    event_id: UUID = field(default_factory=uuid4)
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @property
    def name(self) -> str:
        """Event name, e.g. ``UserRegistered``."""
        return type(self).__name__


Handler = Callable[[DomainEvent], Awaitable[None]]


class EventBus(Protocol):
    """Publish/subscribe interface shared by the in-process bus and future broker adapters."""

    def subscribe(self, event_type: type[DomainEvent], handler: Handler) -> None:
        """Register a handler for an event type."""

    async def publish(self, event: DomainEvent) -> None:
        """Deliver an event to all handlers of its type."""


class InProcessEventBus:
    """Delivers events to handlers in the same process.

    A failing handler is logged and does not stop other handlers or the publisher:
    events are notifications, not part of the publisher's transaction.
    """

    def __init__(self) -> None:
        self._handlers: dict[type[DomainEvent], list[Handler]] = defaultdict(list)

    def subscribe(self, event_type: type[DomainEvent], handler: Handler) -> None:
        """Register a handler for an event type."""
        self._handlers[event_type].append(handler)

    async def publish(self, event: DomainEvent) -> None:
        """Deliver an event to all handlers of its exact type."""
        for handler in list(self._handlers.get(type(event), [])):
            try:
                await handler(event)
            except Exception:
                logger.exception(
                    "event_handler_failed",
                    extra={"event": event.name, "event_id": str(event.event_id)},
                )
