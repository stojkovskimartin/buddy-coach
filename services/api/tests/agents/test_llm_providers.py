from __future__ import annotations

import json

import httpx
import pytest

from buddy_coach.coach.llm import (
    AnthropicProvider,
    DevLLMProvider,
    LLMError,
    LLMRequest,
    Message,
    ToolCall,
    ToolSpec,
)

TOOL = ToolSpec(name="get_profile_summary", description="d", input_schema={"type": "object"})


def _provider(handler: httpx.MockTransport) -> AnthropicProvider:
    return AnthropicProvider("key", "model-x", client=httpx.AsyncClient(transport=handler))


async def test_anthropic_request_mapping_and_tool_use_parsing() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "content": [
                    {"type": "text", "text": "Checking."},
                    {"type": "tool_use", "id": "t9", "name": "get_profile_summary", "input": {}},
                ],
                "usage": {"input_tokens": 12, "output_tokens": 5},
            },
        )

    provider = _provider(httpx.MockTransport(handler))
    request = LLMRequest(
        system="sys",
        messages=(
            Message(role="user", content="hi"),
            Message(
                role="assistant",
                content="",
                tool_calls=(ToolCall(id="t1", name="get_profile_summary", arguments={}),),
            ),
            Message(role="tool", content='{"ok":true}', tool_call_id="t1"),
        ),
        tools=(TOOL,),
    )
    response = await provider.complete(request)

    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "model-x"
    assert body["system"] == "sys"
    assert body["tools"][0]["name"] == "get_profile_summary"
    assert body["tool_choice"] == {"type": "auto"}
    assert body["messages"][1]["content"][0]["type"] == "tool_use"
    assert body["messages"][2] == {
        "role": "user",
        "content": [{"type": "tool_result", "tool_use_id": "t1", "content": '{"ok":true}'}],
    }
    headers = seen["headers"]
    assert isinstance(headers, dict)
    assert headers["x-api-key"] == "key"
    assert response.text == "Checking."
    assert response.tool_calls == (ToolCall(id="t9", name="get_profile_summary", arguments={}),)
    assert (response.input_tokens, response.output_tokens) == (12, 5)


async def test_tool_choice_none_is_sent_with_tools() -> None:
    seen: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"content": [{"type": "text", "text": "ok"}]})

    await _provider(httpx.MockTransport(handler)).complete(
        LLMRequest(system="s", messages=(Message("user", "x"),), tools=(TOOL,), tool_choice="none")
    )
    assert seen[0]["tool_choice"] == {"type": "none"}
    assert seen[0]["tools"]


async def test_retries_on_overload_then_succeeds() -> None:
    statuses = iter([529, 429, 200])

    def handler(_: httpx.Request) -> httpx.Response:
        status = next(statuses)
        return httpx.Response(status, json={"content": [{"type": "text", "text": "ok"}]})

    provider = AnthropicProvider(
        "k", "m", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)), backoff_s=0
    )
    response = await provider.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))
    assert response.text == "ok"


async def test_client_error_is_not_retried() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400, json={})

    provider = AnthropicProvider(
        "k", "m", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)), backoff_s=0
    )
    with pytest.raises(LLMError, match="400"):
        await provider.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))
    assert calls == 1


async def test_unreadable_response_raises_llm_error() -> None:
    provider = _provider(httpx.MockTransport(lambda _: httpx.Response(200, content=b"not json")))
    with pytest.raises(LLMError, match="unreadable"):
        await provider.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))


async def test_max_tokens_stop_reason_marks_truncation() -> None:
    body = {"content": [{"type": "text", "text": "Half"}], "stop_reason": "max_tokens"}
    provider = _provider(httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
    response = await provider.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))
    assert response.truncated


async def test_anthropic_http_error_raises_llm_error() -> None:
    provider = AnthropicProvider(
        "k",
        "m",
        client=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(529, json={}))
        ),
        backoff_s=0,
    )
    with pytest.raises(LLMError, match="529"):
        await provider.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))


async def test_anthropic_network_error_raises_llm_error() -> None:
    def boom(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    provider = AnthropicProvider(
        "k", "m", client=httpx.AsyncClient(transport=httpx.MockTransport(boom)), backoff_s=0
    )
    with pytest.raises(LLMError, match="unreachable"):
        await provider.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))


async def test_dev_provider_calls_argument_free_tool_then_summarises() -> None:
    dev = DevLLMProvider()
    first = await dev.complete(
        LLMRequest(system="s", messages=(Message("user", "x"),), tools=(TOOL,))
    )
    assert first.tool_calls[0].name == "get_profile_summary"
    second = await dev.complete(
        LLMRequest(
            system="s",
            messages=(Message("user", "x"), Message("tool", '{"a":1}', tool_call_id="dev-1")),
        )
    )
    assert '{"a":1}' in second.text
