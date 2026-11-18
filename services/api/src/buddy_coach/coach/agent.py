"""One agent run: the model plans, calls allowed tools, and answers, within hard limits."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass

from buddy_coach.coach.contracts import AgentContract, AgentName
from buddy_coach.coach.llm import LLMProvider, LLMRequest, Message
from buddy_coach.coach.tools import ToolContext, ToolRegistry

logger = logging.getLogger(__name__)

LIMIT_FALLBACK = (
    "I could not finish thinking this through. Could you ask again a bit more specifically?"
)
TOOL_LIMIT_NOTE = '{"error": "Tool call limit reached. Answer with what you have."}'


@dataclass(frozen=True, slots=True)
class AgentResult:
    """What an agent produced and how it got there (for audit logs and tests)."""

    agent: AgentName
    text: str
    tools_used: tuple[str, ...]
    limits_hit: tuple[str, ...]
    tokens_used: int


class Agent:
    """Runs one contract against one LLM with one tool registry."""

    def __init__(self, contract: AgentContract, llm: LLMProvider, registry: ToolRegistry) -> None:
        self._contract = contract
        self._llm = llm
        self._registry = registry

    async def run(
        self,
        user_message: str,
        ctx: ToolContext,
        system: str,
        history: Sequence[Message] = (),
    ) -> AgentResult:
        """Loop: model → tools → model, until it answers or a limit stops it."""
        contract = self._contract
        messages: list[Message] = [*history, Message(role="user", content=user_message)]
        all_tools = self._registry.specs_for(contract)
        tools_used: list[str] = []
        limits: list[str] = []
        tokens = 0

        for _ in range(contract.max_steps):
            tools_left = len(tools_used) < contract.max_tool_calls
            remaining = contract.token_budget - tokens
            if remaining <= 0:
                limits.append("token_budget")
                break
            response = await self._llm.complete(
                LLMRequest(
                    system=system,
                    messages=tuple(messages),
                    tools=all_tools,
                    max_tokens=min(contract.max_output_tokens, remaining),
                    tool_choice="auto" if tools_left else "none",
                )
            )
            tokens += response.input_tokens + response.output_tokens
            if response.truncated:
                limits.append("max_output_tokens")
            if not response.tool_calls:
                return self._result(response.text or LIMIT_FALLBACK, tools_used, limits, tokens)
            if tokens > contract.token_budget:
                limits.append("token_budget")
                break

            messages.append(
                Message(role="assistant", content=response.text, tool_calls=response.tool_calls)
            )
            for call in response.tool_calls:
                if len(tools_used) >= contract.max_tool_calls:
                    if "max_tool_calls" not in limits:
                        limits.append("max_tool_calls")
                    content = TOOL_LIMIT_NOTE
                else:
                    outcome = await self._registry.execute(call, contract, ctx)
                    tools_used.append(call.name)
                    content = outcome.content
                messages.append(Message(role="tool", content=content, tool_call_id=call.id))
        else:
            limits.append("max_steps")

        logger.warning("agent_limit_reached", extra={"agent": contract.name, "limits": limits})
        return self._result(LIMIT_FALLBACK, tools_used, limits, tokens)

    def _result(
        self, text: str, tools_used: list[str], limits: list[str], tokens: int
    ) -> AgentResult:
        return AgentResult(
            agent=self._contract.name,
            text=text.strip(),
            tools_used=tuple(tools_used),
            limits_hit=tuple(limits),
            tokens_used=tokens,
        )
