from uuid import uuid4

import pytest
from douga.core.config import Settings
from douga.integrations.openai_responses import FakeAssistantProvider
from douga.modules.assistant.conversation_context import AssistantConversationCompactor
from douga.modules.assistant.models import AssistantMessage
from douga.modules.assistant.orchestrator import AssistantOrchestrator
from douga.modules.projects.models import Project


def message(role: str, content: str) -> AssistantMessage:
    return AssistantMessage(
        id=uuid4(),
        thread_id=uuid4(),
        user_id=uuid4(),
        role=role,
        content=content,
    )


def test_history_after_summary_keeps_only_uncompacted_messages() -> None:
    old = message("user", "old decision")
    boundary = message("assistant", "accepted")
    recent = message("user", "build it")
    summary = message("system_summary", "accepted production memory")
    summary.content_json = {"through_message_id": str(boundary.id)}

    summary_text, remaining = AssistantConversationCompactor.history_after_summary(
        [old, boundary, recent], summary
    )

    assert summary_text == "accepted production memory"
    assert remaining == [recent]


@pytest.mark.asyncio
async def test_compactor_summarizes_old_turns_and_retains_recent_messages() -> None:
    settings = Settings(
        app_secret_key="test-secret-key-with-at-least-32-characters",
        assistant_history_limit=30,
        assistant_recent_history_limit=12,
        _env_file=None,
    )
    compactor = AssistantConversationCompactor(FakeAssistantProvider(), settings)
    project = Project(name="Video", user_id=uuid4(), content_locale="ja")
    history = [
        message("user" if index % 2 == 0 else "assistant", f"turn {index}") for index in range(31)
    ]

    context = await compactor.build(project, history, None)

    assert context.compacted_message_count == 19
    assert context.compacted_through is history[18]
    assert [item.content for item in context.messages] == [item.content for item in history[-12:]]
    assert context.usage == {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}


def test_continuation_discards_items_superseded_by_server_compaction() -> None:
    continuation = [
        {"type": "reasoning", "id": "old"},
        {"type": "function_call_output", "call_id": "old-call", "output": "{}"},
        {"type": "compaction", "encrypted_content": "compact-context"},
        {"type": "function_call", "call_id": "new-call"},
    ]

    retained = AssistantOrchestrator._continuation_after_latest_compaction(continuation)

    assert retained == continuation[2:]


def test_video_request_policy_continues_from_conversation_to_editable_draft() -> None:
    project = Project(name="Video", user_id=uuid4(), content_locale="ja")

    instructions = AssistantOrchestrator._instructions(
        project,
        conversation_summary="対象は採用担当者。落ち着いた会社紹介動画。",
    )

    assert "evolving production specification" in instructions
    assert "do not require a particular phrase" in instructions
    assert "coherent draft exists" in instructions
    assert "<production_memory>" in instructions


def test_token_budget_discounts_repeated_cached_input() -> None:
    settings = Settings(
        app_secret_key="test-secret-key-with-at-least-32-characters",
        assistant_cached_input_token_weight=0.1,
        _env_file=None,
    )
    orchestrator = AssistantOrchestrator.__new__(AssistantOrchestrator)
    orchestrator.settings = settings

    metered = orchestrator._metered_tokens(
        {
            "input_tokens": 1_000,
            "cached_input_tokens": 900,
            "output_tokens": 100,
            "total_tokens": 1_100,
        }
    )

    assert metered == 290
