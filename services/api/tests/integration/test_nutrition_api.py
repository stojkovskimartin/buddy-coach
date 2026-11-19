"""Nutrition targets with a frozen clock: 2026-11-18 23:30 UTC, already 19 Nov in Zurich."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime

import httpx
import pytest
from fastapi import FastAPI

from buddy_coach.core.deps import get_clock
from tests.support import VALID_PROFILE, register_and_login

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)
URL = "/api/v1/nutrition/targets/today"


@pytest.fixture(autouse=True)
def frozen_clock(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_clock] = lambda: lambda: NOW
    yield
    app.dependency_overrides.pop(get_clock, None)


async def test_targets_need_a_profile(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    response = await client.get(URL, headers=headers)
    assert response.status_code == 404
    assert "profile" in response.json()["detail"]


async def test_targets_follow_the_main_goal(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)

    maintain = (await client.get(URL, headers=headers)).json()
    assert maintain["day"] == "2026-11-19"
    assert maintain["goal"] == "maintain"
    assert maintain["kcal"] == maintain["maintenance_kcal"]

    created = await client.post(
        "/api/v1/goals",
        json={
            "goal_type": "lose_weight",
            "title": "Race weight",
            "target_weight_kg": 76,
            "target_date": "2027-03-01",
            "priority": "primary",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    lose = (await client.get(URL, headers=headers)).json()
    assert lose["goal"] == "lose"
    assert lose["kcal"] < maintain["kcal"]
    assert lose["protein_g"] > maintain["protein_g"]


async def _goal(
    client: httpx.AsyncClient, headers: dict[str, str], **fields: object
) -> dict[str, object]:
    body = {
        "goal_type": "lose_weight",
        "title": "Race weight",
        "target_weight_kg": 76,
        "target_date": "2027-03-01",
        "priority": "primary",
        **fields,
    }
    created = await client.post("/api/v1/goals", json=body, headers=headers)
    assert created.status_code == 201, created.text
    goal: dict[str, object] = created.json()
    return goal


@pytest.mark.parametrize("case", ["secondary", "abandoned", "endurance"])
async def test_only_an_active_primary_weight_goal_changes_intake(
    client: httpx.AsyncClient, case: str
) -> None:
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    if case == "secondary":
        await _goal(client, headers, priority="secondary")
    elif case == "abandoned":
        goal = await _goal(client, headers)
        response = await client.patch(
            f"/api/v1/goals/{goal['id']}", json={"status": "abandoned"}, headers=headers
        )
        assert response.status_code == 200
    else:
        await _goal(
            client,
            headers,
            goal_type="endurance_event",
            title="Zurich Marathon",
            sport="running",
            target_weight_kg=None,
            event_distance_km=42.2,
        )
    targets = (await client.get(URL, headers=headers)).json()
    assert targets["goal"] == "maintain"
    assert targets["kcal"] == targets["maintenance_kcal"]


async def test_targets_say_training_is_estimated(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    targets = (await client.get(URL, headers=headers)).json()
    assert targets["training_kcal_estimated"] is True
    assert "planned week" in targets["reasons"][-1]


async def test_targets_need_authentication(client: httpx.AsyncClient) -> None:
    assert (await client.get(URL)).status_code == 401
