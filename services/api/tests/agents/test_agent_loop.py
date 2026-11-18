from __future__ import annotations

import json

from pydantic import BaseModel

from buddy_coach.coach.agent import LIMIT_FALLBACK, Agent
from buddy_coach.coach.contracts import AgentContract, AgentName
from buddy_coach.coach.llm import LLMResponse, ScriptedLLMProvider
from buddy_coach.coach.tools import Tool, ToolContext, ToolRegistry
from tests.agents.fakes import answer, call, tool_context


class EchoIn(BaseModel):
    value: int


class EchoOut(BaseModel):
    doubled: int


async def _double(_: ToolContext, args: EchoIn) -> EchoOut:
    return EchoOut(doubled=args.value * 2)


def _registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(Tool("double", "Doubles a number.", EchoIn, _double))
    registry.register(Tool("secret", "Not for everyone.", EchoIn, _double))
    return registry


def _contract(**limits: int) -> AgentContract:
    return AgentContract(
        name=AgentName.TRAINING, role="test", allowed_tools=frozenset({"double"}), **limits
    )


async def test_agent_calls_tool_then_answers() -> None:
    llm = ScriptedLLMProvider.of([call("double", value=21), answer("It is 42.")])
    result = await Agent(_contract(), llm, _registry()).run("double 21", tool_context(), "sys")
    assert result.text == "It is 42."
    assert result.tools_used == ("double",)
    assert result.limits_hit == ()
    tool_message = llm.requests[1].messages[-1]
    assert tool_message.role == "tool"
    assert json.loads(tool_message.content) == {"doubled": 42}


async def test_only_allowed_tools_are_offered() -> None:
    llm = ScriptedLLMProvider.of([answer("hi")])
    await Agent(_contract(), llm, _registry()).run("hi", tool_context(), "sys")
    assert [t.name for t in llm.requests[0].tools] == ["double"]


async def test_disallowed_tool_call_returns_error_to_model() -> None:
    llm = ScriptedLLMProvider.of([call("secret", value=1), answer("ok")])
    result = await Agent(_contract(), llm, _registry()).run("x", tool_context(), "sys")
    assert "not available" in llm.requests[1].messages[-1].content
    assert result.text == "ok"


async def test_invalid_arguments_return_error_to_model() -> None:
    llm = ScriptedLLMProvider.of([call("double", value="lots"), answer("sorry")])
    await Agent(_contract(), llm, _registry()).run("x", tool_context(), "sys")
    assert "Invalid arguments" in llm.requests[1].messages[-1].content


async def test_tool_call_limit_stops_tools_and_forces_answer() -> None:
    llm = ScriptedLLMProvider.of(
        [call("double", "a", value=1), call("double", "b", value=2), answer("done")]
    )
    result = await Agent(_contract(max_tool_calls=1), llm, _registry()).run(
        "x", tool_context(), "sys"
    )
    assert result.tools_used == ("double",)
    assert "max_tool_calls" in result.limits_hit
    assert llm.requests[1].tools == ()  # no tools offered once the limit is reached
    assert result.text == "done"


async def test_max_steps_returns_fallback() -> None:
    llm = ScriptedLLMProvider.of([call("double", str(i), value=i) for i in range(3)])
    result = await Agent(_contract(max_steps=3, max_tool_calls=10), llm, _registry()).run(
        "x", tool_context(), "sys"
    )
    assert result.text == LIMIT_FALLBACK
    assert "max_steps" in result.limits_hit


async def test_token_budget_stops_the_run() -> None:
    llm = ScriptedLLMProvider.of([LLMResponse(text="", output_tokens=999, tool_calls=())])
    contract = _contract(token_budget=100)
    result = await Agent(contract, llm, _registry()).run("x", tool_context(), "sys")
    assert result.limits_hit == ("token_budget",)
    assert result.text == LIMIT_FALLBACK


async def test_empty_answer_falls_back() -> None:
    llm = ScriptedLLMProvider.of([answer("")])
    result = await Agent(_contract(), llm, _registry()).run("x", tool_context(), "sys")
    assert result.text == LIMIT_FALLBACK
