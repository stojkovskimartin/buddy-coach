from __future__ import annotations

from types import SimpleNamespace

from buddy_coach.coach.builtin_tools import build_default_registry
from buddy_coach.coach.contracts import AgentName
from buddy_coach.coach.llm import LLMError, LLMRequest, LLMResponse, ScriptedLLMProvider
from buddy_coach.coach.orchestrator import UNAVAILABLE_MESSAGE, HeadCoach
from buddy_coach.coach.safety import SafetyCategory
from buddy_coach.profile.domain import CoachStyle
from tests.agents.fakes import FakeProfiles, answer, call, tool_context


class FailingLLM:
    async def complete(self, request: LLMRequest) -> LLMResponse:
        raise LLMError("down")


async def test_red_flag_never_reaches_the_llm() -> None:
    llm = ScriptedLLMProvider.of([])
    reply = await HeadCoach(llm, build_default_registry()).reply(
        "I have chest pain", tool_context()
    )
    assert reply.escalated
    assert reply.safety_category is SafetyCategory.EMERGENCY
    assert llm.requests == []


async def test_routes_to_specialist_and_reports_tools() -> None:
    llm = ScriptedLLMProvider.of(
        [call("get_profile_summary"), answer("Let's set up your profile.")]
    )
    reply = await HeadCoach(llm, build_default_registry()).reply(
        "How much protein should I eat?", tool_context()
    )
    assert reply.agent is AgentName.NUTRITION
    assert reply.tools_used == ("get_profile_summary",)
    assert '"onboarding_complete":false' in llm.requests[1].messages[-1].content
    assert not reply.escalated


async def test_unsafe_answer_is_replaced() -> None:
    llm = ScriptedLLMProvider.of([answer("Just eat 700 kcal a day.")])
    reply = await HeadCoach(llm, build_default_registry()).reply(
        "How do I lose weight fast with my diet?", tool_context()
    )
    assert reply.safety_category is SafetyCategory.UNSAFE_OUTPUT
    assert "700" not in reply.text


async def test_llm_outage_degrades_gracefully() -> None:
    reply = await HeadCoach(FailingLLM(), build_default_registry()).reply("hello", tool_context())
    assert reply.degraded
    assert reply.text == UNAVAILABLE_MESSAGE


async def test_coach_style_reaches_the_system_prompt() -> None:
    profile = SimpleNamespace(coach_style=CoachStyle.STRICT)
    llm = ScriptedLLMProvider.of([answer("Go.")])
    await HeadCoach(llm, build_default_registry()).reply(
        "hello", tool_context(FakeProfiles(profile=profile))
    )
    assert "direct and demanding" in llm.requests[0].system
