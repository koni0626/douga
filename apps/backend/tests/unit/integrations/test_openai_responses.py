import pytest
from douga.integrations.openai_responses import (
    AssistantProviderMessage,
    FakeAssistantProvider,
)


@pytest.mark.asyncio
async def test_fake_assistant_guides_plot_collaboration() -> None:
    result = await FakeAssistantProvider().respond(
        [AssistantProviderMessage(role="user", content="プロットを一緒に考えて")],
        instructions="test",
    )

    assert "目的" in result.content
    assert result.response_id == "fake-response"
