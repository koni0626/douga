from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from douga.integrations.openai_responses import (
    AssistantProviderMessage,
    FakeAssistantProvider,
    OpenAIResponsesProvider,
)


@pytest.mark.asyncio
async def test_fake_assistant_guides_plot_collaboration() -> None:
    deltas: list[str] = []

    async def receive_delta(delta: str) -> None:
        deltas.append(delta)

    result = await FakeAssistantProvider().respond(
        [AssistantProviderMessage(role="user", content="プロットを一緒に考えて")],
        instructions="test",
        on_delta=receive_delta,
    )

    assert "目的" in result.content
    assert "".join(deltas) == result.content
    assert result.response_id == "fake-response"


@pytest.mark.asyncio
async def test_fake_assistant_requests_plot_tool_only_after_explicit_request() -> None:
    consultation = await FakeAssistantProvider().respond(
        [AssistantProviderMessage(role="user", content="プロットを一緒に考えて")],
        instructions="test",
    )
    requested = await FakeAssistantProvider().respond(
        [AssistantProviderMessage(role="user", content="プロットを作って保存して")],
        instructions="test",
    )

    assert consultation.tool_calls == ()
    assert requested.tool_calls[0].name == "save_plot"


def test_openai_response_adapter_extracts_function_calls() -> None:
    item = SimpleNamespace(
        type="function_call",
        call_id="call-1",
        name="save_plot",
        arguments='{"content":{"title":"Plot"}}',
        __api_exclude__={"parsed_arguments"},
        model_dump=lambda **_: {
            "type": "function_call",
            "id": "function-call-item-1",
            "call_id": "call-1",
            "name": "save_plot",
            "arguments": '{"content":{"title":"Plot"}}',
            "parsed_arguments": {"content": {"title": "Plot"}},
            "status": "completed",
        },
    )
    response = SimpleNamespace(
        usage=None,
        output=[item],
        output_text="",
        id="response-1",
    )

    result = OpenAIResponsesProvider._result(response)

    assert result.tool_calls[0].call_id == "call-1"
    assert result.tool_calls[0].arguments["content"]["title"] == "Plot"
    assert result.output_items[0]["id"] == "function-call-item-1"
    assert "status" not in result.output_items[0]
    assert "parsed_arguments" not in result.output_items[0]


def test_openai_response_adapter_preserves_encrypted_reasoning_output() -> None:
    reasoning = SimpleNamespace(
        type="reasoning",
        model_dump=lambda **_: {
            "type": "reasoning",
            "id": "reasoning-1",
            "encrypted_content": "encrypted-context",
            "summary": [],
            "status": "completed",
        },
    )
    response = SimpleNamespace(
        usage=None,
        output=[reasoning],
        output_text="",
        id="response-1",
    )

    result = OpenAIResponsesProvider._result(response)

    assert result.output_items[0]["encrypted_content"] == "encrypted-context"
    assert "status" not in result.output_items[0]


@pytest.mark.asyncio
async def test_openai_response_adapter_requests_encrypted_reasoning_context() -> None:
    response = SimpleNamespace(usage=None, output=[], output_text="done", id="response-1")
    create = AsyncMock(return_value=response)
    provider = OpenAIResponsesProvider.__new__(OpenAIResponsesProvider)
    provider.client = cast(Any, SimpleNamespace(responses=SimpleNamespace(create=create)))
    provider.model = "gpt-5.6"
    reasoning_item = {
        "type": "reasoning",
        "id": "reasoning-1",
        "encrypted_content": "encrypted-context",
        "summary": [],
    }

    result = await provider.respond(
        [AssistantProviderMessage(role="user", content="Generate an image")],
        instructions="test",
        continuation=(reasoning_item,),
    )

    assert result.content == "done"
    assert create.await_args is not None
    request = create.await_args.kwargs
    assert request["store"] is False
    assert request["include"] == ["reasoning.encrypted_content"]
    assert request["input"][-1] == reasoning_item


@pytest.mark.asyncio
async def test_openai_stream_requests_encrypted_reasoning_context() -> None:
    response = SimpleNamespace(usage=None, output=[], output_text="done", id="response-1")

    class FakeStream:
        async def __aenter__(self) -> FakeStream:
            return self

        async def __aexit__(self, *args: object) -> None:
            del args

        def __aiter__(self) -> AsyncIterator[object]:
            async def events() -> AsyncIterator[object]:
                if False:
                    yield object()

            return events()

        async def get_final_response(self) -> SimpleNamespace:
            return response

    captured: dict[str, object] = {}

    def stream(**kwargs: object) -> FakeStream:
        captured.update(kwargs)
        return FakeStream()

    async def receive_delta(delta: str) -> None:
        raise AssertionError(f"unexpected delta: {delta}")

    provider = OpenAIResponsesProvider.__new__(OpenAIResponsesProvider)
    provider.client = cast(Any, SimpleNamespace(responses=SimpleNamespace(stream=stream)))
    provider.model = "gpt-5.6"

    result = await provider.respond(
        [AssistantProviderMessage(role="user", content="Generate an image")],
        instructions="test",
        on_delta=receive_delta,
    )

    assert result.content == "done"
    assert captured["store"] is False
    assert captured["include"] == ["reasoning.encrypted_content"]
