"""Provider-neutral LLM interface and its implementations.

Agents only see ``LLMProvider``. Tests use ``ScriptedLLMProvider``; local development without an
API key uses ``DevLLMProvider``; real answers come from ``AnthropicProvider`` or, for free local or
hosted models, ``OpenAICompatibleProvider``.
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


DEV_NOTICE = (
    "(development coach) No AI model is connected, so I can only show your saved data. "
    "For real answers set BUDDY_LLM_PROVIDER; a free model on your own computer works too "
    "(docs/running.md, 'Real AI answers')."
)


def _readable(value: Any, indent: str = "") -> list[str]:
    """Turn a JSON tool result into indented "Label: value" lines, skipping empty fields."""
    if isinstance(value, dict):
        lines: list[str] = []
        for key, item in value.items():
            if item in (None, "", [], {}):
                continue
            label = f"{indent}- {key.replace('_', ' ').capitalize()}"
            if isinstance(item, dict | list):
                lines += [f"{label}:", *_readable(item, indent + "  ")]
            else:
                lines.append(f"{label}: {_scalar(item)}")
        return lines
    if isinstance(value, list):
        # A blank line between items shows where one goal (or entry) ends and the next begins.
        lines = []
        for position, item in enumerate(value):
            lines += ([""] if position else []) + _readable(item, indent)
        return lines
    return [f"{indent}- {_scalar(value)}"]


def _scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)


class DevLLMProvider:
    """Deterministic stand-in for local development without an API key.

    On the first step it calls every offered tool that needs no arguments (the agent stops at its
    tool limit); afterwards it lists each tool's data under the tool's name. Good enough to see
    the whole stack and the user's data without a model.
    """

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Call the argument-free tools, then list what they returned."""
        tool_results = [m for m in request.messages if m.role == "tool"]
        if not tool_results and request.tool_choice == "auto":
            calls = tuple(
                ToolCall(id=f"dev-{i}", name=tool.name, arguments={})
                for i, tool in enumerate(request.tools)
                if not tool.input_schema.get("required")
            )
            if calls:
                return LLMResponse(tool_calls=calls)
        names = {c.id: c.name for m in request.messages for c in m.tool_calls}
        sections: list[str] = []
        for message in tool_results:
            try:
                lines = _readable(json.loads(message.content))
            except ValueError:
                continue  # not data, e.g. the note that the tool limit was reached
            if lines:
                title = names.get(message.tool_call_id or "", "").removeprefix("get_")
                heading = title.replace("_", " ").capitalize() or "Data"
                sections.append("\n".join([f"{heading}:", *lines]))
        return LLMResponse(text=f"{DEV_NOTICE}\n\n" + ("\n\n".join(sections) or "No data yet."))


class _HttpProvider:
    """HTTP client, retries with backoff and shutdown shared by the real providers."""

    RETRY_STATUSES = frozenset({429, 500, 502, 503, 529})

    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        timeout_s: float = 30.0,
        max_retries: int = 2,
        backoff_s: float = 0.5,
    ) -> None:
        self._client = client or httpx.AsyncClient(timeout=timeout_s)
        self._max_retries = max_retries
        self._backoff_s = backoff_s

    async def aclose(self) -> None:
        """Close the HTTP client (called on app shutdown)."""
        await self._client.aclose()

    async def _post_with_retries(
        self, url: str, payload: dict[str, Any], headers: dict[str, str]
    ) -> httpx.Response:
        for attempt in range(self._max_retries + 1):
            last_try = attempt == self._max_retries
            try:
                response = await self._client.post(url, json=payload, headers=headers)
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


class AnthropicProvider(_HttpProvider):
    """Anthropic Messages API over HTTPS."""

    API_URL = "https://api.anthropic.com/v1/messages"
    API_VERSION = "2023-06-01"

    def __init__(self, api_key: str, model: str, **http: Any) -> None:
        super().__init__(**http)
        self._api_key = api_key
        self._model = model

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
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": self.API_VERSION,
            "content-type": "application/json",
        }
        response = await self._post_with_retries(self.API_URL, payload, headers)
        try:
            return _from_anthropic_response(response.json())
        except (ValueError, KeyError, TypeError) as exc:
            raise LLMError("LLM provider returned an unreadable response") from exc


class OpenAICompatibleProvider(_HttpProvider):
    """Any server that speaks the OpenAI Chat Completions API with tools.

    Covers local models (Ollama, LM Studio: free, nothing leaves the machine) and hosted ones
    (Groq, Google Gemini, OpenRouter). ``api_key`` is optional because local servers need none.
    """

    def __init__(self, base_url: str, model: str, api_key: str | None = None, **http: Any) -> None:
        super().__init__(**http)
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._model = model
        self._api_key = api_key

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Send one request; map tool calls both ways."""
        payload: dict[str, Any] = {
            "model": self._model,
            "max_tokens": request.max_tokens,
            "messages": [
                {"role": "system", "content": request.system},
                *_to_openai_messages(request.messages),
            ],
        }
        if request.tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    },
                }
                for t in request.tools
            ]
            payload["tool_choice"] = request.tool_choice
        headers = {"content-type": "application/json"}
        if self._api_key:
            headers["authorization"] = f"Bearer {self._api_key}"
        response = await self._post_with_retries(self._url, payload, headers)
        try:
            return _from_openai_response(response.json())
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            raise LLMError("LLM provider returned an unreadable response") from exc


def _to_openai_messages(messages: Sequence[Message]) -> list[dict[str, Any]]:
    """OpenAI wants tool calls on the assistant turn and each result as a ``tool`` turn."""
    out: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "tool":
            out.append(
                {"role": "tool", "tool_call_id": message.tool_call_id, "content": message.content}
            )
        elif message.role == "assistant" and message.tool_calls:
            out.append(
                {
                    "role": "assistant",
                    "content": message.content or None,
                    "tool_calls": [
                        {
                            "id": c.id,
                            "type": "function",
                            "function": {"name": c.name, "arguments": json.dumps(c.arguments)},
                        }
                        for c in message.tool_calls
                    ],
                }
            )
        else:
            out.append({"role": message.role, "content": message.content})
    return out


def _from_openai_response(body: dict[str, Any]) -> LLMResponse:
    choice = body["choices"][0]
    message = choice["message"]
    calls: list[ToolCall] = []
    for index, call in enumerate(message.get("tool_calls") or []):
        raw = call["function"].get("arguments") or "{}"
        try:
            arguments = json.loads(raw) if isinstance(raw, str) else raw
        except ValueError:
            arguments = {"_raw": raw}
        if not isinstance(arguments, dict):
            arguments = {"_raw": json.dumps(arguments)}
        calls.append(
            ToolCall(
                # Some local servers leave the id out; the agent only needs it to be unique.
                id=str(call.get("id") or f"call-{index}"),
                name=str(call["function"]["name"]),
                arguments=arguments,
            )
        )
    usage = body.get("usage") or {}
    return LLMResponse(
        text=(message.get("content") or "").strip(),
        tool_calls=tuple(calls),
        input_tokens=int(usage.get("prompt_tokens", 0)),
        output_tokens=int(usage.get("completion_tokens", 0)),
        truncated=choice.get("finish_reason") == "length",
    )


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
