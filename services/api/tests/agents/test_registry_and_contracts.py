from __future__ import annotations

import pytest

from buddy_coach.coach.builtin_tools import build_default_registry
from buddy_coach.coach.contracts import CONTRACTS, AgentContract, AgentName, system_prompt
from buddy_coach.coach.tools import Tool, ToolRegistry
from tests.agents.test_agent_loop import EchoIn, _double


def test_every_contract_only_names_registered_tools() -> None:
    registry = build_default_registry()
    for contract in CONTRACTS.values():
        assert contract.allowed_tools <= registry.names(), contract.name


def test_every_agent_has_a_contract() -> None:
    assert set(CONTRACTS) == set(AgentName)


def test_duplicate_tool_registration_is_rejected() -> None:
    registry = ToolRegistry()
    registry.register(Tool("t", "d", EchoIn, _double))
    with pytest.raises(ValueError, match="already registered"):
        registry.register(Tool("t", "d", EchoIn, _double))


def test_contract_limits_must_be_positive() -> None:
    with pytest.raises(ValueError, match="positive"):
        AgentContract(name=AgentName.TRAINING, role="r", allowed_tools=frozenset(), max_steps=0)


def test_tool_specs_expose_json_schema() -> None:
    spec = build_default_registry().specs_for(CONTRACTS[AgentName.RECOVERY])
    readiness = next(s for s in spec if s.name == "assess_readiness")
    assert set(readiness.input_schema["required"]) == {"sleep_quality", "soreness", "mood"}


@pytest.mark.parametrize(
    ("style", "expected"),
    [("strict", "direct"), ("data_driven", "numbers"), ("friendly", "warm"), (None, "warm")],
)
def test_system_prompt_includes_rules_and_style(style: str | None, expected: str) -> None:
    prompt = system_prompt(CONTRACTS[AgentName.NUTRITION], style)
    assert "must come from a tool result" in prompt
    assert "not a doctor" in prompt
    assert expected in prompt
