"""Body weight with a frozen clock: 2026-11-18 23:30 UTC (19 Nov in Zurich)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from buddy_coach.body.events import BodyWeightChanged
from buddy_coach.core.deps import get_clock
from tests.support import VALID_PROFILE, RecordingEventBus, register_and_login

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)
URL = "/api/v1/body/weights"


@pytest.fixture(autouse=True)
def frozen_clock(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_clock] = lambda: lambda: NOW
    yield
    app.dependency_overrides.pop(get_clock, None)


async def _athlete(client: httpx.AsyncClient, email: str = "athlete@example.com") -> dict[str, str]:
    headers = await register_and_login(client, email)
    assert (
        await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    ).status_code == 200
    return headers


def _scale(external_id: str, measured_at: str, kg: float, **fields: Any) -> dict[str, Any]:
    return {
        "source": "health_connect",
        "external_id": external_id,
        "measured_at": measured_at,
        "weight_kg": kg,
        **fields,
    }


async def _profile_weight(client: httpx.AsyncClient, headers: dict[str, str]) -> float:
    weight: float = (await client.get("/api/v1/profile", headers=headers)).json()["weight_kg"]
    return weight


async def test_manual_weight_is_stored_on_the_athletes_day_and_updates_the_profile(
    client: httpx.AsyncClient, event_bus: RecordingEventBus
) -> None:
    headers = await _athlete(client)
    response = await client.post(URL, json={"weight_kg": 77.4}, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert (body["source"], body["day"], body["weight_kg"]) == ("manual", "2026-11-19", 77.4)
    assert await _profile_weight(client, headers) == 77.4
    targets = (await client.get("/api/v1/nutrition/targets/today", headers=headers)).json()
    assert targets["maintenance_kcal"] > 0  # computed from the new weight without errors
    assert any(isinstance(e, BodyWeightChanged) for e in event_bus.published)


async def test_scale_sync_is_idempotent_skips_implausible_readings_and_keeps_the_latest(
    client: httpx.AsyncClient,
) -> None:
    headers = await _athlete(client)
    batch = [
        _scale("hc-1", "2026-11-17T06:30:00+00:00", 78.6),
        _scale("hc-2", "2026-11-18T06:30:00+00:00", 78.2),
        _scale("hc-3", "2026-11-18T07:00:00+00:00", 18.5),  # a child on the shared scale
    ]
    first = await client.post(f"{URL}/import", json={"weights": batch}, headers=headers)
    assert first.json() == {"created": 2, "updated": 0, "skipped": 1}
    again = await client.post(f"{URL}/import", json={"weights": batch}, headers=headers)
    assert again.json() == {"created": 0, "updated": 2, "skipped": 1}
    assert await _profile_weight(client, headers) == 78.2

    older = [_scale("hc-0", "2026-11-10T06:30:00+00:00", 80.0)]
    await client.post(f"{URL}/import", json={"weights": older}, headers=headers)
    assert await _profile_weight(client, headers) == 78.2  # an older reading never wins


async def test_an_import_of_only_implausible_readings_changes_nothing(
    client: httpx.AsyncClient,
) -> None:
    headers = await _athlete(client)
    batch = [_scale("kid", "2026-11-18T07:00:00+00:00", 18.5)]
    response = await client.post(f"{URL}/import", json={"weights": batch}, headers=headers)
    assert response.json() == {"created": 0, "updated": 0, "skipped": 1}
    assert await _profile_weight(client, headers) == VALID_PROFILE["weight_kg"]


async def test_deleting_the_latest_weight_falls_back_to_the_one_before(
    client: httpx.AsyncClient,
) -> None:
    headers = await _athlete(client)
    await client.post(
        f"{URL}/import",
        json={"weights": [_scale("hc-1", "2026-11-17T06:30:00+00:00", 78.6)]},
        headers=headers,
    )
    latest = (await client.post(URL, json={"weight_kg": 90.0}, headers=headers)).json()
    assert (await client.delete(f"{URL}/{latest['id']}", headers=headers)).status_code == 204
    assert await _profile_weight(client, headers) == 78.6
    assert (await client.delete(f"{URL}/{latest['id']}", headers=headers)).status_code == 404


async def test_history_lists_weights_and_a_seven_day_trend(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    batch = [
        _scale("a", "2026-11-10T06:00:00+00:00", 80.0),  # before the range: fills the window
        _scale("b", "2026-11-15T06:00:00+00:00", 79.0),
        _scale("c", "2026-11-15T19:00:00+00:00", 81.0),  # evening: not the day's value
        _scale("d", "2026-11-17T06:00:00+00:00", 78.0),
    ]
    await client.post(f"{URL}/import", json={"weights": batch}, headers=headers)
    body = (
        await client.get(URL, params={"from": "2026-11-15", "to": "2026-11-19"}, headers=headers)
    ).json()
    assert [w["weight_kg"] for w in body["weights"]] == [78.0, 81.0, 79.0]  # newest first
    assert body["trend"] == [
        {"day": "2026-11-15", "weight_kg": 79.5},  # 10 and 15 Nov
        {"day": "2026-11-17", "weight_kg": 78.5},  # 10 Nov is outside 11-17 Nov
    ]


async def test_weights_are_private_validated_and_never_in_the_future(
    client: httpx.AsyncClient,
) -> None:
    owner = await _athlete(client)
    other = await _athlete(client, "other@example.com")
    mine = (await client.post(URL, json={"weight_kg": 70.0}, headers=owner)).json()
    assert (await client.delete(f"{URL}/{mine['id']}", headers=other)).status_code == 404
    assert (await client.get(URL, headers=other)).json()["weights"] == []

    assert (await client.post(URL, json={"weight_kg": 20}, headers=owner)).status_code == 422
    future = {"weight_kg": 70.0, "measured_at": "2026-11-19T06:00:00+00:00"}
    assert (await client.post(URL, json=future, headers=owner)).status_code == 422
    manual = [_scale("m", "2026-11-17T06:00:00+00:00", 70.0, source="manual")]
    response = await client.post(f"{URL}/import", json={"weights": manual}, headers=owner)
    assert response.status_code == 422
    too_long = {"from": "2025-01-01", "to": "2026-11-19"}
    assert (await client.get(URL, params=too_long, headers=owner)).status_code == 422


async def test_weights_before_onboarding_are_kept_without_a_profile(
    client: httpx.AsyncClient,
) -> None:
    headers = await register_and_login(client)
    response = await client.post(URL, json={"weight_kg": 70.0}, headers=headers)
    assert response.status_code == 201
    assert response.json()["day"] == "2026-11-18"  # UTC until a time zone is known


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", URL),
        ("POST", URL),
        ("POST", f"{URL}/import"),
        ("DELETE", f"{URL}/00000000-0000-0000-0000-000000000000"),
    ],
)
async def test_weights_need_authentication(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    assert (await client.request(method, path, json={})).status_code == 401
