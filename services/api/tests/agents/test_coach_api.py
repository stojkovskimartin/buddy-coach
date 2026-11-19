"""End-to-end through HTTP: auth, profile in Postgres, agents, tools and engines together."""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from buddy_coach.coach.llm import LLMProvider, ScriptedLLMProvider
from buddy_coach.core.deps import get_clock
from tests.agents.fakes import answer, call
from tests.support import VALID_PROFILE, register_and_login

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)
ZURICH_TODAY = date(2026, 11, 19)  # already the next day for the athlete


@pytest.fixture(autouse=True)
def frozen_clock(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_clock] = lambda: lambda: NOW
    yield
    app.dependency_overrides.pop(get_clock, None)


@pytest.fixture
def llm_provider() -> LLMProvider:
    return ScriptedLLMProvider.of(
        [call("get_today_targets"), answer("Your daily target is in the app.")]
    )


async def _athlete(client: httpx.AsyncClient) -> dict[str, str]:
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    return headers


async def _tool_result(
    client: httpx.AsyncClient,
    llm: ScriptedLLMProvider,
    headers: dict[str, str],
    tool: str,
    message: str,
) -> dict[str, Any]:
    llm.responses.clear()
    llm.responses.extend([call(tool), answer("ok")])
    response = await client.post("/api/v1/coach/chat", json={"message": message}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["tools_used"] == [tool]
    result: dict[str, Any] = json.loads(llm.requests[-1].messages[-1].content)
    return result


async def test_coach_targets_are_the_ones_the_app_shows(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    headers = await _athlete(client)
    await client.post(
        "/api/v1/goals",
        json={"goal_type": "lose_weight", "title": "Race weight", "target_weight_kg": 75},
        headers=headers,
    )

    response = await client.post(
        "/api/v1/coach/chat", json={"message": "How many calories should I eat?"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["agent"] == "nutrition"
    assert body["tools_used"] == ["get_today_targets"]

    tool_result = json.loads(llm_provider.requests[1].messages[-1].content)
    shown = (await client.get("/api/v1/nutrition/targets/today", headers=headers)).json()
    assert tool_result == shown
    assert tool_result["day"] == ZURICH_TODAY.isoformat()
    assert tool_result["goal"] == "lose"


async def test_coach_reads_todays_checkin_on_the_athletes_day(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    headers = await _athlete(client)
    missing = await _tool_result(
        client, llm_provider, headers, "get_today_readiness", "Am I recovered enough?"
    )
    assert "error" in missing

    await client.put(
        "/api/v1/checkins/today",
        json={"sleep_quality": 2, "soreness": 4, "mood": 3, "pain": False},
        headers=headers,
    )
    result = await _tool_result(
        client, llm_provider, headers, "get_today_readiness", "Am I recovered enough?"
    )
    shown = (await client.get("/api/v1/checkins/today", headers=headers)).json()
    assert result["readiness"] == shown["readiness"]
    assert result["sleep_quality"] == 2
    assert "day" not in result


async def test_coach_reads_the_training_load(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    headers = await _athlete(client)
    await client.post(
        "/api/v1/workouts",
        json={
            "activity": "running",
            "started_at": "2026-11-18T18:00:00+01:00",
            "duration_min": 50,
            "rpe": 6,
        },
        headers=headers,
    )
    result = await _tool_result(
        client, llm_provider, headers, "get_training_load", "How is my training going?"
    )
    shown = (await client.get("/api/v1/training/load", headers=headers)).json()
    assert result["today"] == shown["today"]
    assert result["ramp"] == shown["ramp"]
    assert "days" not in result  # the day-by-day history stays out of the prompt


async def test_coach_reads_the_food_diary_without_food_names(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    headers = await _athlete(client)
    food = {
        "name": "Grandma's secret recipe",
        "grams": 300,
        "protein_g": 20,
        "carbs_g": 40,
        "fat_g": 10,
    }
    await client.post(
        "/api/v1/meals/entries", json={**food, "meal": "lunch", "kcal": 330}, headers=headers
    )
    await client.post(
        "/api/v1/meals/entries", json={**food, "meal": "lunch", "kcal": 300}, headers=headers
    )
    today = await _tool_result(client, llm_provider, headers, "get_food_today", "What did I eat?")
    assert today["totals"]["kcal"] == 630
    assert today["meals"] == [{"meal": "lunch", "kcal": 630.0, "foods": 2}]
    assert "secret" not in json.dumps(today)  # user-written food names never reach the model

    week = await _tool_result(client, llm_provider, headers, "get_food_last_days", "How did I eat?")
    assert len(week["days"]) == 1
    assert week["days"][0]["day"] == ZURICH_TODAY.isoformat()


async def test_coach_reads_the_weight_trend(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    headers = await _athlete(client)
    empty = await _tool_result(
        client, llm_provider, headers, "get_weight_trend", "My weight trend?"
    )
    assert (empty["latest_kg"], empty["measurements"]) == (None, 0)
    readings = [
        {
            "source": "health_connect",
            "external_id": d,
            "measured_at": f"2026-11-{d}T06:00:00+00:00",
            "weight_kg": kg,
        }
        for d, kg in [("01", 80.0), ("18", 78.0)]
    ]
    await client.post("/api/v1/body/weights/import", json={"weights": readings}, headers=headers)
    trend = await _tool_result(
        client, llm_provider, headers, "get_weight_trend", "My weight trend?"
    )
    assert (trend["latest_kg"], trend["latest_day"], trend["measurements"]) == (
        78.0,
        "2026-11-18",
        2,
    )
    assert (trend["trend_start_kg"], trend["trend_end_kg"], trend["trend_change_kg"]) == (
        80.0,
        78.0,
        -2.0,
    )


async def test_coach_requires_authentication(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/coach/chat", json={"message": "hi"})
    assert response.status_code == 401


async def test_escalation_over_http(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    response = await client.post(
        "/api/v1/coach/chat", json={"message": "I fainted during my run"}, headers=headers
    )
    body = response.json()
    assert body["escalated"] is True
    assert body["safety_category"] == "emergency"
    assert "144" in body["reply"]


async def test_message_length_is_limited(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    response = await client.post(
        "/api/v1/coach/chat", json={"message": "x" * 2001}, headers=headers
    )
    assert response.status_code == 422


async def test_goal_days_to_target_are_computed(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    llm_provider.responses.clear()
    llm_provider.responses.extend([call("list_goals"), answer("Keep going.")])
    headers = await _athlete(client)
    target = ZURICH_TODAY + timedelta(days=100)  # counted from the athlete's day
    await client.post(
        "/api/v1/goals",
        json={
            "goal_type": "endurance_event",
            "title": "Marathon",
            "sport": "running",
            "target_date": target.isoformat(),
        },
        headers=headers,
    )
    await client.post(
        "/api/v1/coach/chat", json={"message": "How is my progress?"}, headers=headers
    )
    goals = json.loads(llm_provider.requests[1].messages[-1].content)["goals"]
    assert goals[0]["days_to_target"] == 100
    assert "id" not in goals[0]  # no identifiers are sent to the model
    assert "title" not in goals[0]  # no user free text either
