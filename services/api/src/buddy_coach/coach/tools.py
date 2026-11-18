"""Typed tools and the registry that enforces which agent may call which tool."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic import BaseModel, ValidationError

from buddy_coach.coach.contracts import AgentContract
from buddy_coach.coach.llm import ToolCall, ToolSpec
from buddy_coach.core.errors import DomainError
from buddy_coach.profile.service import ProfileService

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ToolContext:
    """What a tool may use. Tools never see the user's email or name."""

    user_id: uuid.UUID
    today: date
    profiles: ProfileService


ToolHandler = Callable[[ToolContext, Any], Awaitable[BaseModel]]


@dataclass(frozen=True, slots=True)
class Tool:
    """A capability an agent can invoke, with validated input and output."""

    name: str
    description: str
    input_model: type[BaseModel]
    handler: ToolHandler

    def spec(self) -> ToolSpec:
        """The tool as the LLM sees it."""
        schema = self.input_model.model_json_schema()
        schema.pop("title", None)
        return ToolSpec(name=self.name, description=self.description, input_schema=schema)


@dataclass(frozen=True, slots=True)
class ToolOutcome:
    """Result of one tool call, serialised for the model."""

    name: str
    ok: bool
    content: str


class ToolRegistry:
    """All tools, plus the permission check against an agent's contract."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Add a tool. Names must be unique."""
        if tool.name in self._tools:
            msg = f"tool {tool.name} is already registered"
            raise ValueError(msg)
        self._tools[tool.name] = tool

    def names(self) -> frozenset[str]:
        """Registered tool names."""
        return frozenset(self._tools)

    def specs_for(self, contract: AgentContract) -> tuple[ToolSpec, ...]:
        """Specs of the tools this agent may use, in a stable order."""
        return tuple(
            self._tools[n].spec() for n in sorted(contract.allowed_tools) if n in self._tools
        )

    async def execute(
        self, call: ToolCall, contract: AgentContract, ctx: ToolContext
    ) -> ToolOutcome:
        """Run a tool call. Never raises for model mistakes: errors go back to the model."""
        if call.name not in contract.allowed_tools:
            logger.warning("tool_not_allowed", extra={"agent": contract.name, "tool": call.name})
            return ToolOutcome(
                call.name, ok=False, content=_error("This tool is not available to you.")
            )
        tool = self._tools.get(call.name)
        if tool is None:
            return ToolOutcome(call.name, ok=False, content=_error("Unknown tool."))
        try:
            arguments = tool.input_model.model_validate(call.arguments)
        except ValidationError as exc:
            return ToolOutcome(
                call.name, ok=False, content=_error(f"Invalid arguments: {exc.errors()}")
            )
        try:
            result = await tool.handler(ctx, arguments)
        except (DomainError, ValueError) as exc:
            return ToolOutcome(call.name, ok=False, content=_error(str(exc)))
        return ToolOutcome(call.name, ok=True, content=result.model_dump_json())


def _error(message: str) -> str:
    return json.dumps({"error": message}, default=str)
