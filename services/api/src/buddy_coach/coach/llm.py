"""Provider-neutral LLM interface and its implementations.

Agents only see ``LLMProvider``. Tests use ``ScriptedLLMProvider``; local development without an
API key uses ``DevLLMProvider``; production uses ``AnthropicProvider``.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

import httpx

logger = logging.getLogger(__name__)

Role = Literal["user", "assistant", "tool"]


@dataclass(frozen=True, slots=True)
class ToolCall:
    """A tool invocation requested by the model."""

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True, slots=True)
class Message:
    """One turn of the conversation sent to the model."""

    role: Role
    content: str
    tool_calls: tuple[ToolCall, ...] = ()
    tool_call_id: str | None = None


@dataclass(frozen=True, slots=True)
class ToolSpec:
    """A tool as the model sees it."""

    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass(frozen=True, slots=True)
class LLMRequest:
    """Everything a provider needs for one completion."""

    system: str
    messages: tuple[Message, ...]
    tools: tuple[ToolSpec, ...] = ()
    max_tokens: int = 800
    # "none" keeps tool definitions (required while the history holds tool blocks) but tells
    # the model it must answer in text now.
    tool_choice: Literal["auto", "none"] = "auto"


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Model output: text, tool calls, or both, plus token usage."""

    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    input_tokens: int = 0
    output_tokens: int = 0
    truncated: bool = False  # the model hit max_tokens before finishing


class LLMError(Exception):
    """The provider failed (network, rate limit, bad response)."""


class LLMProvider(Protocol):
    """Anything that can complete an ``LLMRequest``."""

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Return the model's next response."""


@dataclass
class ScriptedLLMProvider:
    """Returns pre-defined responses in order and records every request. For tests."""

    responses: deque[LLMResponse] = field(default_factory=deque)
    requests: list[LLMRequest] = field(default_factory=list)

    @classmethod
    def of(cls, responses: Iterable[LLMResponse]) -> ScriptedLLMProvider:
        """Build from a list of responses."""
        return cls(responses=deque(responses))

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Pop the next scripted response."""
        self.requests.append(request)
        if not self.responses:
            msg = "ScriptedLLMProvider ran out of responses"
            raise LLMError(msg)
        return self.responses.popleft()


class DevLLMProvider:
    """Deterministic stand-in for local development without an API key.

    On the first step it calls the first offered tool that needs no arguments; afterwards it
    answers with a plain summary of the tool results. Good enough to exercise the whole stack.
    """

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Call one argument-free tool, then summarise."""
        tool_results = [m for m in request.messages if m.role == "tool"]
        if not tool_results and request.tool_choice == "auto":
            for tool in request.tools:
                if not tool.input_schema.get("required"):
                    return LLMResponse(
                        tool_calls=(ToolCall(id="dev-1", name=tool.name, arguments={}),)
                    )
        summary = "; ".join(m.content for m in tool_results) or "no data yet"
        return LLMResponse(
            text=f"(development coach) Here is what I found: {summary}",
        )


class AnthropicProvider:
    """Anthropic Messages API over HTTPS."""

    API_URL = "https://api.anthropic.com/v1/messages"
    API_VERSION = "2023-06-01"
    RETRY_STATUSES = frozenset({429, 500, 502, 503, 529})

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        client: httpx.AsyncClient | None = None,
        timeout_s: float = 30.0,
        max_retries: int = 2,
        backoff_s: float = 0.5,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._client = client or httpx.AsyncClient(timeout=timeout_s)
        self._max_retries = max_retries
        self._backoff_s = backoff_s

    async def aclose(self) -> None:
        """Close the HTTP client (called on app shutdown)."""
        await self._client.aclose()

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Send one request; map tool use both ways."""
        payload: dict[str, Any] = {
            "model": self._model,
            "max_tokens": request.max_tokens,
            "system": request.system,
            "messages": _to_anthropic_messages(request.messages),
        }
        if request.tools:
            payload["tools"] = [
                {"name": t.name, "description": t.description, "input_schema": t.input_schema}
                for t in request.tools
            ]
            payload["tool_choice"] = {"type": request.tool_choice}
        response = await self._post_with_retries(payload)
        try:
            return _from_anthropic_response(response.json())
        except (ValueError, KeyError, TypeError) as exc:
            raise LLMError("LLM provider returned an unreadable response") from exc

    async def _post_with_retries(self, payload: dict[str, Any]) -> httpx.Response:
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": self.API_VERSION,
            "content-type": "application/json",
        }
        for attempt in range(self._max_retries + 1):
            last_try = attempt == self._max_retries
            try:
                response = await self._client.post(self.API_URL, json=payload, headers=headers)
            except httpx.HTTPError as exc:
                if last_try:
                    raise LLMError("LLM provider unreachable") from exc
            else:
                if response.status_code == httpx.codes.OK:
                    return response
                logger.warning("llm_error", extra={"status": response.status_code})
                if response.status_code not in self.RETRY_STATUSES or last_try:
                    msg = f"LLM provider returned {response.status_code}"
                    raise LLMError(msg)
            await asyncio.sleep(self._backoff_s * 2**attempt)
        msg = "unreachable"  # pragma: no cover
        raise LLMError(msg)


def _to_anthropic_messages(messages: Sequence[Message]) -> list[dict[str, Any]]:
    """Anthropic wants tool results as user turns with ``tool_result`` blocks."""
    out: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "tool":
            block = {
                "type": "tool_result",
                "tool_use_id": message.tool_call_id,
                "content": message.content,
            }
            if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list):
                out[-1]["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
        elif message.role == "assistant" and message.tool_calls:
            content: list[dict[str, Any]] = []
            if message.content:
                content.append({"type": "text", "text": message.content})
            content.extend(
                {"type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments}
                for c in message.tool_calls
            )
            out.append({"role": "assistant", "content": content})
        else:
            out.append({"role": message.role, "content": message.content})
    return out


def _from_anthropic_response(body: dict[str, Any]) -> LLMResponse:
    texts: list[str] = []
    calls: list[ToolCall] = []
    for block in body.get("content", []):
        if block.get("type") == "text":
            texts.append(str(block.get("text", "")))
        elif block.get("type") == "tool_use":
            arguments = block.get("input") or {}
            if not isinstance(arguments, dict):
                arguments = {"_raw": json.dumps(arguments)}
            calls.append(
                ToolCall(id=str(block["id"]), name=str(block["name"]), arguments=arguments)
            )
    usage = body.get("usage", {})
    return LLMResponse(
        text="\n".join(texts).strip(),
        tool_calls=tuple(calls),
        input_tokens=int(usage.get("input_tokens", 0)),
        output_tokens=int(usage.get("output_tokens", 0)),
        truncated=body.get("stop_reason") == "max_tokens",
    )
