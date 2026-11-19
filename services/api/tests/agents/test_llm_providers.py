from __future__ import annotations

import json

import httpx
import pytest

from buddy_coach.coach.deps import build_llm_provider
from buddy_coach.coach.llm import (
    DEV_NOTICE,
    AnthropicProvider,
    DevLLMProvider,
    LLMError,
    LLMRequest,
    Message,
    OpenAICompatibleProvider,
    ToolCall,
    ToolSpec,
)
from buddy_coach.core.config import LLMProviderName
from tests.support import make_settings

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


async def test_dev_provider_calls_every_argument_free_tool_then_lists_them_by_name() -> None:
    dev = DevLLMProvider()
    targets = ToolSpec(name="get_today_targets", description="d", input_schema={"type": "object"})
    session = ToolSpec(
        name="session_fuelling",
        description="d",
        input_schema={"type": "object", "required": ["duration_min"]},
    )
    first = await dev.complete(
        LLMRequest(system="s", messages=(Message("user", "x"),), tools=(TOOL, targets, session))
    )
    assert [c.name for c in first.tool_calls] == ["get_profile_summary", "get_today_targets"]

    second = await dev.complete(
        LLMRequest(
            system="s",
            messages=(
                Message("user", "x"),
                Message("assistant", "", tool_calls=first.tool_calls),
                Message(
                    "tool",
                    '{"onboarding_complete":true,"sex":null,"primary_goal":{"goal_type":"run"}}',
                    tool_call_id=first.tool_calls[0].id,
                ),
                Message("tool", '{"kcal":2330,"reasons":[]}', tool_call_id=first.tool_calls[1].id),
            ),
        )
    )
    assert second.text == (
        f"{DEV_NOTICE}\n\nProfile summary:\n- Onboarding complete: yes\n- Primary goal:\n"
        "  - Goal type: run\n\nToday targets:\n- Kcal: 2330"
    )


async def test_dev_provider_skips_notes_and_empty_data_and_says_when_nothing_is_left() -> None:
    dev = DevLLMProvider()
    response = await dev.complete(
        LLMRequest(
            system="s",
            messages=(
                Message("tool", "Tool limit reached.", tool_call_id="dev-0"),
                Message("tool", '{"days":[]}', tool_call_id="dev-1"),
            ),
        )
    )
    assert response.text == f"{DEV_NOTICE}\n\nNo data yet."
    empty = await dev.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))
    assert empty.text == f"{DEV_NOTICE}\n\nNo data yet."


async def test_dev_provider_separates_list_items_and_shows_tool_errors() -> None:
    dev = DevLLMProvider()
    goals = '{"goals":[{"goal_type":"run","sport":""},{"goal_type":"lose_weight"}]}'
    response = await dev.complete(
        LLMRequest(
            system="s",
            messages=(
                Message("tool", goals, tool_call_id="dev-1"),
                Message("tool", '{"error":"unknown tool"}', tool_call_id="dev-2"),
            ),
        )
    )
    assert response.text == (
        f"{DEV_NOTICE}\n\nData:\n- Goals:\n  - Goal type: run\n\n  - Goal type: lose_weight"
        "\n\nData:\n- Error: unknown tool"
    )


def _openai(handler: httpx.MockTransport, api_key: str | None = None) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        "http://localhost:11434/v1/",
        "qwen3:8b",
        api_key,
        client=httpx.AsyncClient(transport=handler),
    )


async def test_openai_compatible_request_mapping_and_tool_call_parsing() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "c7",
                                    "type": "function",
                                    "function": {"name": "list_goals", "arguments": '{"a": 1}'},
                                }
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ],
                "usage": {"prompt_tokens": 20, "completion_tokens": 4},
            },
        )

    response = await _openai(httpx.MockTransport(handler)).complete(
        LLMRequest(
            system="sys",
            messages=(
                Message("user", "hi"),
                Message(
                    "assistant",
                    "",
                    tool_calls=(ToolCall(id="t1", name="get_profile_summary", arguments={}),),
                ),
                Message("tool", '{"ok":true}', tool_call_id="t1"),
            ),
            tools=(TOOL,),
        )
    )

    assert seen["url"] == "http://localhost:11434/v1/chat/completions"
    headers = seen["headers"]
    assert isinstance(headers, dict)
    assert "authorization" not in headers  # local servers need no key
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "qwen3:8b"
    assert body["messages"][0] == {"role": "system", "content": "sys"}
    assert body["messages"][2] == {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "t1",
                "type": "function",
                "function": {"name": "get_profile_summary", "arguments": "{}"},
            }
        ],
    }
    assert body["messages"][3] == {"role": "tool", "tool_call_id": "t1", "content": '{"ok":true}'}
    assert body["tools"][0] == {
        "type": "function",
        "function": {
            "name": "get_profile_summary",
            "description": "d",
            "parameters": {"type": "object"},
        },
    }
    assert body["tool_choice"] == "auto"
    assert response.text == ""
    assert response.tool_calls == (ToolCall(id="c7", name="list_goals", arguments={"a": 1}),)
    assert (response.input_tokens, response.output_tokens) == (20, 4)


async def test_openai_compatible_sends_the_key_and_reads_text_and_truncation() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": " Half "}, "finish_reason": "length"}]},
        )

    response = await _openai(httpx.MockTransport(handler), api_key="gsk-test").complete(
        LLMRequest(system="s", messages=(Message("user", "x"),))
    )
    assert seen["auth"] == "Bearer gsk-test"
    assert (response.text, response.truncated) == ("Half", True)


async def test_openai_compatible_tolerates_bad_arguments_and_a_missing_id() -> None:
    body = {
        "choices": [
            {
                "message": {
                    "tool_calls": [{"function": {"name": "list_goals", "arguments": "{oops"}}]
                }
            }
        ]
    }
    response = await _openai(
        httpx.MockTransport(lambda _: httpx.Response(200, json=body))
    ).complete(LLMRequest(system="s", messages=(Message("user", "x"),)))
    assert response.tool_calls[0] == ToolCall(
        id="call-0", name="list_goals", arguments={"_raw": "{oops"}
    )


async def test_openai_compatible_unreadable_response_raises_llm_error() -> None:
    provider = _openai(httpx.MockTransport(lambda _: httpx.Response(200, json={"choices": []})))
    with pytest.raises(LLMError, match="unreadable"):
        await provider.complete(LLMRequest(system="s", messages=(Message("user", "x"),)))


async def test_settings_pick_the_openai_compatible_provider() -> None:
    settings = make_settings(
        llm_provider=LLMProviderName.OPENAI_COMPATIBLE,
        llm_base_url="http://localhost:11434/v1",
        llm_model="qwen3:8b",
    )
    provider = build_llm_provider(settings)
    assert isinstance(provider, OpenAICompatibleProvider)
    await provider.aclose()
