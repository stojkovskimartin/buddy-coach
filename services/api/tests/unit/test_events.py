from __future__ import annotations

from dataclasses import dataclass

import pytest

from buddy_coach.core.events import DomainEvent, InProcessEventBus


@dataclass(frozen=True, kw_only=True)
class Pinged(DomainEvent):
    value: int


@dataclass(frozen=True, kw_only=True)
class Other(DomainEvent):
    pass


async def test_publish_delivers_to_all_handlers_of_the_type() -> None:
    bus = InProcessEventBus()
    received: list[int] = []

    async def first(event: DomainEvent) -> None:
        assert isinstance(event, Pinged)
        received.append(event.value)

    async def second(event: DomainEvent) -> None:
        assert isinstance(event, Pinged)
        received.append(event.value * 10)

    bus.subscribe(Pinged, first)
    bus.subscribe(Pinged, second)
    await bus.publish(Pinged(value=2))
    assert received == [2, 20]


async def test_handlers_of_other_types_are_not_called() -> None:
    bus = InProcessEventBus()
    called = False

    async def handler(_: DomainEvent) -> None:
        nonlocal called
        called = True

    bus.subscribe(Other, handler)
    await bus.publish(Pinged(value=1))
    assert not called


async def test_failing_handler_does_not_stop_others(caplog: pytest.LogCaptureFixture) -> None:
    bus = InProcessEventBus()
    received: list[int] = []

    async def broken(_: DomainEvent) -> None:
        raise RuntimeError("boom")

    async def healthy(event: DomainEvent) -> None:
        assert isinstance(event, Pinged)
        received.append(event.value)

    bus.subscribe(Pinged, broken)
    bus.subscribe(Pinged, healthy)
    await bus.publish(Pinged(value=7))
    assert received == [7]
    assert "event_handler_failed" in caplog.text


def test_event_has_name_and_id() -> None:
    event = Pinged(value=1)
    assert event.name == "Pinged"
    assert event.event_id != Pinged(value=1).event_id
