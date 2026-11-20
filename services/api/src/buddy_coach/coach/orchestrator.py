"""Head Coach: the single entry point that guards, routes, delegates and checks answers."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass

from buddy_coach.coach.agent import Agent
from buddy_coach.coach.contracts import CONTRACTS, AgentName, system_prompt
from buddy_coach.coach.llm import LLMError, LLMProvider, Message
from buddy_coach.coach.routing import IntentRouter
from buddy_coach.coach.safety import SafetyCategory, SafetyGuard, safety_language
from buddy_coach.coach.tools import ToolContext, ToolRegistry

logger = logging.getLogger(__name__)

UNAVAILABLE_MESSAGE = (
    "I cannot reach my coaching brain right now. Your data is safe; please try again in a minute."
)


@dataclass(frozen=True, slots=True)
class CoachReply:
    """The answer the user sees, with metadata for the client and the audit log."""

    text: str
    agent: AgentName
    tools_used: tuple[str, ...] = ()
    limits_hit: tuple[str, ...] = ()
    safety_category: SafetyCategory = SafetyCategory.NONE
    degraded: bool = False

    @property
    def escalated(self) -> bool:
        """True when the Safety Guard replaced normal coaching."""
        return self.safety_category is not SafetyCategory.NONE


class HeadCoach:
    """Guard input → route → run the specialist → guard output."""

    def __init__(
        self,
        llm: LLMProvider,
        registry: ToolRegistry,
        guard: SafetyGuard | None = None,
        router: IntentRouter | None = None,
    ) -> None:
        self._llm = llm
        self._registry = registry
        self._guard = guard or SafetyGuard()
        self._router = router or IntentRouter()

    async def reply(
        self, message: str, ctx: ToolContext, history: Sequence[Message] = ()
    ) -> CoachReply:
        """Answer one user message."""
        profile = await ctx.profiles.find_profile(ctx.user_id)
        language = safety_language(profile.locale if profile else None, message)
        verdict = self._guard.check_input(message, language)
        if not verdict.allowed:
            logger.info("coach_escalated_input", extra={"category": verdict.category})
            return CoachReply(
                text=verdict.message or "",
                agent=AgentName.HEAD_COACH,
                safety_category=verdict.category,
            )

        agent_name = self._router.route(message)
        contract = CONTRACTS[agent_name]
        style = profile.coach_style.value if profile else None
        try:
            result = await Agent(contract, self._llm, self._registry).run(
                message, ctx, system_prompt(contract, style), history
            )
        except LLMError:
            logger.exception("coach_llm_unavailable", extra={"agent": agent_name})
            return CoachReply(text=UNAVAILABLE_MESSAGE, agent=agent_name, degraded=True)

        output_verdict = self._guard.check_output(result.text, language)
        logger.info(
            "coach_reply",
            extra={
                "agent": agent_name,
                "tools": list(result.tools_used),
                "limits": list(result.limits_hit),
                "tokens": result.tokens_used,
                "output_blocked": not output_verdict.allowed,
            },
        )
        if not output_verdict.allowed:
            return CoachReply(
                text=output_verdict.message or "",
                agent=agent_name,
                tools_used=result.tools_used,
                limits_hit=result.limits_hit,
                safety_category=output_verdict.category,
            )
        return CoachReply(
            text=result.text,
            agent=agent_name,
            tools_used=result.tools_used,
            limits_hit=result.limits_hit,
        )
