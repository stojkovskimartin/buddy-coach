from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Any

import httpx
import pytest

from buddy_coach.profile.events import GoalChanged, ProfileUpdated
from tests.support import VALID_PROFILE, RecordingEventBus, register_and_login

pytestmark = pytest.mark.integration

FUTURE = (date.today() + timedelta(days=200)).isoformat()


async def _with_profile(
    client: httpx.AsyncClient, email: str = "athlete@example.com"
) -> dict[str, str]:
    headers = await register_and_login(client, email)
    response = await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    assert response.status_code == 200, response.text
    return headers


async def _create_goal(
    client: httpx.AsyncClient, headers: dict[str, str], **fields: Any
) -> httpx.Response:
    body = {"goal_type": "general_fitness", "title": "Get fitter", **fields}
    return await client.post("/api/v1/goals", json=body, headers=headers)


async def test_profile_is_404_before_onboarding(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    response = await client.get("/api/v1/profile", headers=headers)
    assert response.status_code == 404


async def test_put_creates_then_updates_profile(
    client: httpx.AsyncClient, event_bus: RecordingEventBus
) -> None:
    headers = await _with_profile(client)
    updated = await client.put(
        "/api/v1/profile", json={**VALID_PROFILE, "weight_kg": 77.5}, headers=headers
    )
    assert updated.status_code == 200
    fetched = await client.get("/api/v1/profile", headers=headers)
    assert fetched.json()["weight_kg"] == 77.5
    assert sum(isinstance(e, ProfileUpdated) for e in event_bus.published) == 2


async def test_minors_are_rejected(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    response = await client.put(
        "/api/v1/profile",
        json={**VALID_PROFILE, "birth_year": date.today().year - 15},
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_failed"


async def test_unknown_timezone_is_rejected(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    response = await client.put(
        "/api/v1/profile", json={**VALID_PROFILE, "timezone": "Mars/Olympus"}, headers=headers
    )
    assert response.status_code == 422


async def test_weight_goal_must_point_in_the_right_direction(client: httpx.AsyncClient) -> None:
    headers = await _with_profile(client)
    wrong = await _create_goal(client, headers, goal_type="lose_weight", target_weight_kg=85)
    assert wrong.status_code == 422
    right = await _create_goal(client, headers, goal_type="lose_weight", target_weight_kg=74)
    assert right.status_code == 201


async def test_endurance_goal_needs_date_and_sport(client: httpx.AsyncClient) -> None:
    headers = await _with_profile(client)
    missing = await _create_goal(client, headers, goal_type="endurance_event", sport="running")
    assert missing.status_code == 422
    ok = await _create_goal(
        client,
        headers,
        goal_type="endurance_event",
        title="Half Ironman",
        sport="triathlon",
        target_date=FUTURE,
        event_distance_km=113,
    )
    assert ok.status_code == 201
    assert ok.json()["status"] == "active"


async def test_new_primary_goal_demotes_previous_primary(
    client: httpx.AsyncClient, event_bus: RecordingEventBus
) -> None:
    headers = await _with_profile(client)
    first = (await _create_goal(client, headers, title="First")).json()
    second = (await _create_goal(client, headers, title="Second")).json()

    goals = {g["id"]: g for g in (await client.get("/api/v1/goals", headers=headers)).json()}
    assert goals[first["id"]]["priority"] == "secondary"
    assert goals[second["id"]]["priority"] == "primary"
    assert sum(isinstance(e, GoalChanged) for e in event_bus.published) == 2


async def test_goal_status_update_and_filter(client: httpx.AsyncClient) -> None:
    headers = await _with_profile(client)
    goal = (await _create_goal(client, headers)).json()
    patched = await client.patch(
        f"/api/v1/goals/{goal['id']}", json={"status": "achieved"}, headers=headers
    )
    assert patched.status_code == 200
    active = await client.get("/api/v1/goals", params={"status": "active"}, headers=headers)
    achieved = await client.get("/api/v1/goals", params={"status": "achieved"}, headers=headers)
    assert active.json() == []
    assert [g["id"] for g in achieved.json()] == [goal["id"]]


async def test_reactivating_a_primary_goal_keeps_one_active_primary(
    client: httpx.AsyncClient,
) -> None:
    headers = await _with_profile(client)
    old = (await _create_goal(client, headers, title="Old")).json()
    await client.patch(f"/api/v1/goals/{old['id']}", json={"status": "abandoned"}, headers=headers)
    new = (await _create_goal(client, headers, title="New")).json()

    reactivated = await client.patch(
        f"/api/v1/goals/{old['id']}", json={"status": "active"}, headers=headers
    )
    assert reactivated.status_code == 200
    goals = (await client.get("/api/v1/goals", params={"status": "active"}, headers=headers)).json()
    primaries = [g for g in goals if g["priority"] == "primary"]
    assert [g["id"] for g in primaries] == [old["id"]]
    assert {g["id"] for g in goals} == {old["id"], new["id"]}


async def test_users_cannot_touch_each_others_goals(client: httpx.AsyncClient) -> None:
    owner = await _with_profile(client, "owner@example.com")
    goal = (await _create_goal(client, owner)).json()
    intruder = await register_and_login(client, "intruder@example.com")

    patch = await client.patch(
        f"/api/v1/goals/{goal['id']}", json={"status": "abandoned"}, headers=intruder
    )
    assert patch.status_code == 404
    listed = await client.get("/api/v1/goals", headers=intruder)
    assert listed.json() == []


async def test_concurrent_first_profile_saves_do_not_fail(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    responses = await asyncio.gather(
        *(
            client.put(
                "/api/v1/profile", json={**VALID_PROFILE, "weight_kg": 70 + i}, headers=headers
            )
            for i in range(4)
        )
    )
    assert [r.status_code for r in responses] == [200] * 4


async def test_concurrent_primary_goals_keep_exactly_one_primary(
    client: httpx.AsyncClient,
) -> None:
    headers = await _with_profile(client)
    responses = await asyncio.gather(
        *(_create_goal(client, headers, title=f"Goal {i}") for i in range(5))
    )
    assert [r.status_code for r in responses] == [201] * 5
    goals = (await client.get("/api/v1/goals", params={"status": "active"}, headers=headers)).json()
    assert sum(g["priority"] == "primary" for g in goals) == 1
