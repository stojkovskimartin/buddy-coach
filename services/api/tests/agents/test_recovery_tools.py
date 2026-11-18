"""Recovery nutrition, supplement and micronutrient tools over HTTP with a real profile."""

from __future__ import annotations

import json

import httpx
import pytest

from buddy_coach.coach.llm import LLMProvider, ScriptedLLMProvider
from tests.agents.fakes import answer, call
from tests.support import VALID_PROFILE, register_and_login

pytestmark = pytest.mark.integration


@pytest.fixture
def llm_provider() -> LLMProvider:
    return ScriptedLLMProvider.of([])


async def _ask(
    client: httpx.AsyncClient, llm: ScriptedLLMProvider, message: str, tool: str, **args: object
) -> dict[str, object]:
    llm.responses.extend([call(tool, **args), answer("Here you go.")])
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    response = await client.post("/api/v1/coach/chat", json={"message": message}, headers=headers)
    assert response.status_code == 200
    assert response.json()["agent"] == "nutrition"
    result: dict[str, object] = json.loads(llm.requests[1].messages[-1].content)
    return result


async def test_recovery_meal_after_hard_session(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "What should I eat after my hard interval session?",
        "recovery_nutrition",
        duration_min=75,
        intensity="hard",
        hours_until_next_session=20,
    )
    assert result["recovery_carbs_g"] == 79  # 1.0 g/kg for 79 kg
    assert result["protein_per_meal_g"] == 24
    assert result["meals_per_day"] == 4
    assert "daily_protein_from_meals_g" not in result  # no second, conflicting daily target


async def test_creatine_advice_comes_from_catalogue(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "Should I take creatine for strength?",
        "supplement_guidance",
        purposes=["strength_power"],
    )
    suggested = result["suggested"]
    assert isinstance(suggested, list)
    creatine = next(s for s in suggested if s["name"] == "Creatine monohydrate")
    assert creatine["max_daily"] == "5 g"
    assert any("Kölner Liste" in n for n in result["notes"])  # type: ignore[union-attr]


async def test_health_flags_move_supplements_to_professional(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "Is creatine ok? I have kidney disease.",
        "supplement_guidance",
        purposes=["strength_power"],
        health_flags=["kidney_disease"],
    )
    names = [s["name"] for s in result["ask_a_professional"]]  # type: ignore[union-attr]
    assert "Creatine monohydrate" in names


async def test_micronutrient_reference_for_profile_sex(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "How much iron and vitamin D do I need?",
        "micronutrient_reference",
        nutrients=["iron", "vitamin_d"],
    )
    refs = {r["nutrient"]: r for r in result["references"]}  # type: ignore[union-attr]
    assert refs["iron"]["daily_reference"] == 11  # male reference
    assert refs["vitamin_d"]["upper_limit"] == 100
    assert "not a diagnosis" in str(result["note"])


async def test_unknown_purpose_is_rejected_back_to_model(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "Which supplement makes me bigger fast?",
        "supplement_guidance",
        purposes=["steroids"],
    )
    assert "Invalid arguments" in str(result["error"])


async def test_professional_only_supplements_carry_no_dose(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "Should I take vitamin D or iron?",
        "supplement_guidance",
        purposes=["general_health"],
    )
    professional = {e["name"]: e for e in result["ask_a_professional"]}  # type: ignore[union-attr]
    for name in ("Vitamin D", "Iron"):
        assert professional[name]["max_daily"] is None
        assert "blood test" in professional[name]["typical_use"]


async def test_contraindication_through_tool_for_caffeine(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "Can I use caffeine before races? I take medication.",
        "supplement_guidance",
        purposes=["endurance"],
        health_flags=["takes_medication"],
    )
    suggested = {s["name"] for s in result["suggested"]}  # type: ignore[union-attr]
    assert "Caffeine" not in suggested


async def test_magnesium_limit_is_labelled_supplements_only(
    client: httpx.AsyncClient, llm_provider: ScriptedLLMProvider
) -> None:
    result = await _ask(
        client,
        llm_provider,
        "How much magnesium do I need?",
        "micronutrient_reference",
        nutrients=["magnesium"],
    )
    ref = result["references"][0]  # type: ignore[index]
    assert ref["upper_limit_applies_to"] == "supplements only"
