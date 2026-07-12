from types import SimpleNamespace

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
        model_dump=lambda **_: {
            "type": "function_call",
            "call_id": "call-1",
            "name": "save_plot",
            "arguments": '{"content":{"title":"Plot"}}',
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
