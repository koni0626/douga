from __future__ import annotations

from time import monotonic, sleep
from typing import Any

from scripts.douga.client import DougaClient


class DougaAssistantClient:
    """Synchronous REST client for the same assistant used by the Douga editor."""

    def __init__(self, client: DougaClient) -> None:
        self.client = client

    def create_thread(
        self, project_id: str, *, title: str | None = None, key: str | None = None
    ) -> dict[str, Any]:
        return self.client.request(
            "POST",
            f"/projects/{project_id}/assistant/threads",
            json={"title": title} if title else {},
            idempotency_key=key,
        )

    def list_threads(self, project_id: str) -> dict[str, Any]:
        return self.client.request("GET", f"/projects/{project_id}/assistant/threads")

    def get_thread(self, project_id: str, thread_id: str) -> dict[str, Any]:
        return self.client.request("GET", f"/projects/{project_id}/assistant/threads/{thread_id}")

    def send_message(
        self,
        project_id: str,
        thread_id: str,
        content: str,
        *,
        context: dict[str, Any] | None = None,
        key: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"content": content}
        if context is not None:
            payload["context"] = context
        return self.client.request(
            "POST",
            f"/projects/{project_id}/assistant/threads/{thread_id}/messages",
            json=payload,
            idempotency_key=key,
        )

    def get_run(self, project_id: str, run_id: str) -> dict[str, Any]:
        return self.client.request("GET", f"/projects/{project_id}/assistant/runs/{run_id}")

    def wait_for_run(
        self,
        project_id: str,
        run_id: str,
        *,
        timeout: float = 600,
        poll_interval: float = 0.5,
    ) -> dict[str, Any]:
        deadline = monotonic() + timeout
        while True:
            run = self.get_run(project_id, run_id)
            if run.get("status") in {"completed", "failed", "cancelled", "waiting_approval"}:
                return run
            if monotonic() >= deadline:
                raise TimeoutError(f"assistant run did not finish within {timeout} seconds")
            sleep(max(0, poll_interval))

    def approve_tool_call(
        self, project_id: str, call_id: str, *, key: str | None = None
    ) -> dict[str, Any]:
        return self.client.request(
            "POST",
            f"/projects/{project_id}/assistant/tool-calls/{call_id}/approve",
            idempotency_key=key,
        )

    def reject_tool_call(
        self, project_id: str, call_id: str, *, key: str | None = None
    ) -> dict[str, Any]:
        return self.client.request(
            "POST",
            f"/projects/{project_id}/assistant/tool-calls/{call_id}/reject",
            idempotency_key=key,
        )

    def cancel_run(self, project_id: str, run_id: str, *, key: str | None = None) -> dict[str, Any]:
        return self.client.request(
            "POST",
            f"/projects/{project_id}/assistant/runs/{run_id}/cancel",
            idempotency_key=key,
        )

    def undo_run(self, project_id: str, run_id: str, *, key: str | None = None) -> dict[str, Any]:
        return self.client.request(
            "POST",
            f"/projects/{project_id}/assistant/runs/{run_id}/undo",
            idempotency_key=key,
        )

    def chat(
        self,
        project_id: str,
        content: str,
        *,
        thread_id: str | None = None,
        title: str | None = None,
        context: dict[str, Any] | None = None,
        timeout: float = 600,
    ) -> dict[str, Any]:
        thread = (
            self.get_thread(project_id, thread_id)["thread"]
            if thread_id
            else self.create_thread(project_id, title=title)
        )
        started = self.send_message(
            project_id,
            str(thread["id"]),
            content,
            context=context,
        )
        run = self.wait_for_run(project_id, str(started["run_id"]), timeout=timeout)
        detail = self.get_thread(project_id, str(thread["id"]))
        return {"thread": detail["thread"], "run": run, "detail": detail}
