import pytest
from douga.modules.automation.controller import OPERATION_READ_SCOPES
from douga.modules.automation.middleware import AutomationMiddleware


@pytest.mark.parametrize(
    ("path", "operation_type"),
    [
        (
            "/api/v1/projects/project-1/assistant/threads",
            "assistant_thread_create",
        ),
        (
            "/api/v1/projects/project-1/assistant/threads/thread-1/messages",
            "assistant_message_send",
        ),
        (
            "/api/v1/projects/project-1/assistant/runs/run-1/cancel",
            "assistant_run_cancel",
        ),
        (
            "/api/v1/projects/project-1/assistant/runs/run-1/undo",
            "assistant_run_undo",
        ),
        (
            "/api/v1/projects/project-1/assistant/tool-calls/call-1/approve",
            "assistant_tool_approve",
        ),
        (
            "/api/v1/projects/project-1/assistant/tool-calls/call-1/reject",
            "assistant_tool_reject",
        ),
    ],
)
def test_assistant_posts_have_a_readable_automation_operation(
    path: str, operation_type: str
) -> None:
    assert AutomationMiddleware._operation_type(path) == operation_type
    assert OPERATION_READ_SCOPES[operation_type] == "assistant:read"
