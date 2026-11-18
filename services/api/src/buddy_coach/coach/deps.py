"""Wiring of the coach network into the app."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, Request

from buddy_coach.coach.builtin_tools import build_default_registry
from buddy_coach.coach.llm import AnthropicProvider, DevLLMProvider, LLMProvider
from buddy_coach.coach.orchestrator import HeadCoach
from buddy_coach.coach.tools import ToolContext
from buddy_coach.core.config import LLMProviderName, Settings
from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.profile.deps import ProfileServiceDep


def build_llm_provider(settings: Settings) -> LLMProvider:
    """The configured LLM provider."""
    if settings.llm_provider is LLMProviderName.ANTHROPIC:
        assert settings.anthropic_api_key is not None  # noqa: S101  # enforced by Settings
        return AnthropicProvider(settings.anthropic_api_key.get_secret_value(), settings.llm_model)
    return DevLLMProvider()


def install_coach(app: FastAPI, settings: Settings, llm: LLMProvider | None = None) -> None:
    """Create the shared, stateless coach objects once per app."""
    app.state.llm_provider = llm or build_llm_provider(settings)
    app.state.head_coach = HeadCoach(app.state.llm_provider, build_default_registry())


async def close_coach(app: FastAPI) -> None:
    """Release resources held by the LLM provider (e.g. its HTTP client)."""
    llm = getattr(app.state, "llm_provider", None)
    close = getattr(llm, "aclose", None)
    if close is not None:
        await close()


def get_head_coach(request: Request) -> HeadCoach:
    """The app's Head Coach."""
    coach: HeadCoach = request.app.state.head_coach
    return coach


def get_tool_context(current: CurrentUserDep, profiles: ProfileServiceDep) -> ToolContext:
    """Per-request tool context for the authenticated user."""
    return ToolContext(user_id=current.id, today=datetime.now(UTC).date(), profiles=profiles)


HeadCoachDep = Annotated[HeadCoach, Depends(get_head_coach)]
ToolContextDep = Annotated[ToolContext, Depends(get_tool_context)]
