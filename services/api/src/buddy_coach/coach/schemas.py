"""Public request/response models of the coach module."""

from __future__ import annotations

from pydantic import BaseModel, Field

from buddy_coach.coach.contracts import AgentName
from buddy_coach.coach.safety import SafetyCategory


class ChatRequest(BaseModel):
    """A message to the coach."""

    message: str = Field(min_length=1, max_length=2000)


class ChatReply(BaseModel):
    """The coach's answer."""

    reply: str
    agent: AgentName
    tools_used: list[str]
    escalated: bool
    safety_category: SafetyCategory
    degraded: bool = Field(description="True when the AI was unavailable and a fallback was used")
