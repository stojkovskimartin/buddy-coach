"""End-to-end through HTTP: auth, profile in Postgres, agents, tools and engines together."""

from __future__ import annotations

import json
from datetime import date, timedelta

import httpx
import pytest

from buddy_coach.coach.llm import LLMProvider, ScriptedLLMProvider
from buddy_coach.science.nutrition import BodyData, EnergyGoal, Lifestyle, Sex, daily_targets
from tests.agents.fakes import answer, call
from tests.support import VALID_PROFILE, register_and_login

pytestmark = pytest.mark.integration


@pytest.fixture
def llm_provider() -> LLMProvider:
    return ScriptedLLMProvider.of(
        [call("calculate_nutrition_targets"), answer("Your daily target is in the app.")]
    )


async def test_nutrition_numbers_come_from_the_engine(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
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
    assert body["tools_used"] == ["calculate_nutrition_targets"]

    tool_result = json.loads(llm_provider.requests[1].messages[-1].content)
    age = (
        date.today().year
        - VALID_PROFILE["birth_year"]
        - (1 if date.today() < date(date.today().year, 7, 1) else 0)
    )
    expected = daily_targets(
        BodyData(weight_kg=79, height_cm=182, age_years=age, sex=Sex.MALE),
        Lifestyle.LIGHT,
        EnergyGoal.LOSE,
    )
    assert tool_result["goal"] == "lose"
    assert tool_result["kcal"] == expected.kcal
    assert tool_result["protein_g"] == expected.protein_g


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
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    target = date.today() + timedelta(days=100)
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
