"""Test doubles for the agent tests that do not need a database."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any, cast

from buddy_coach.coach.llm import LLMResponse, ToolCall
from buddy_coach.coach.tools import ToolContext
from buddy_coach.profile.service import ProfileService


@dataclass
class FakeProfiles:
    """Stands in for ProfileService: no profile, no goals unless given."""

    profile: Any = None
    goals: list[Any] = field(default_factory=list)

    async def find_profile(self, user_id: uuid.UUID) -> Any:
        return self.profile

    async def list_goals(self, user_id: uuid.UUID, status: Any) -> list[Any]:
        return self.goals


def tool_context(profiles: FakeProfiles | None = None) -> ToolContext:
    """A ToolContext backed by fakes."""
    return ToolContext(
        user_id=uuid.uuid4(),
        today=date(2026, 11, 18),
        profiles=cast(ProfileService, profiles or FakeProfiles()),
    )


def call(name: str, call_id: str = "c1", **arguments: Any) -> LLMResponse:
    """A model response that calls one tool."""
    return LLMResponse(tool_calls=(ToolCall(id=call_id, name=name, arguments=arguments),))


def answer(text: str, tokens: int = 0) -> LLMResponse:
    """A final text answer."""
    return LLMResponse(text=text, output_tokens=tokens)
