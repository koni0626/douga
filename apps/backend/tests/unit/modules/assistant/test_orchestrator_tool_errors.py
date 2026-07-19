from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from douga.core.errors import ConflictError
from douga.modules.assistant.orchestrator import AssistantOrchestrator


@pytest.mark.asyncio
async def test_tool_application_error_refreshes_run_after_session_rollback() -> None:
    run = SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        user_id=uuid4(),
        status="running",
    )
    call = SimpleNamespace(
        id=uuid4(),
        tool_name="add_audio_clip",
        arguments_json={},
        status="requested",
        result_json=None,
        finished_at=None,
    )
    orchestrator = AssistantOrchestrator.__new__(AssistantOrchestrator)
    orchestrator.session = SimpleNamespace(refresh=AsyncMock())
    orchestrator.repository = SimpleNamespace(add_event=AsyncMock())
    orchestrator.uow = SimpleNamespace(commit=AsyncMock())
    orchestrator.tools = SimpleNamespace(
        execute=AsyncMock(
            side_effect=ConflictError("PROJECT_CONFLICT", "errors.projectConflict")
        )
    )

    result = await orchestrator._run_tool(run, call)

    assert result == {"error": {"code": "PROJECT_CONFLICT"}}
    assert orchestrator.session.refresh.await_args_list[0].args == (run,)
    assert orchestrator.session.refresh.await_args_list[1].args == (call,)
    assert call.status == "failed"
    assert call.result_json == result
    orchestrator.repository.add_event.assert_awaited()
    orchestrator.uow.commit.assert_awaited()
