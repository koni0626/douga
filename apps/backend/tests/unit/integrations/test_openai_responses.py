import pytest
from douga.integrations.openai_responses import (
    AssistantProviderMessage,
    FakeAssistantProvider,
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
