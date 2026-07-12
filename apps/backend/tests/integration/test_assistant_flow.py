import os

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from douga.modules.assets.models import Asset, AssetDerivative, AssetTag, Tag
from douga.modules.assistant.models import (
    AssistantMessage,
    AssistantRun,
    AssistantRunEvent,
    AssistantThread,
    AssistantToolCall,
    CreativeDocument,
)
from douga.modules.assistant.service import AssistantService
from douga.modules.auth.models import User, UserSession
from douga.modules.exports.models import Export
from douga.modules.image_generations.models import ImageGenerationRequest
from douga.modules.jobs.models import Job
from douga.modules.projects.models import Project, ProjectAsset, ProjectRevision
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="integration database not configured"
)


async def clear_data() -> None:
    async with session_factory() as session:
        for model in (
            CreativeDocument,
            AssistantToolCall,
            AssistantRunEvent,
            AssistantMessage,
            AssistantRun,
            AssistantThread,
            ImageGenerationRequest,
            Export,
            Job,
            ProjectAsset,
            ProjectRevision,
            Project,
            AssetDerivative,
            AssetTag,
            Tag,
            Asset,
            UserSession,
            User,
        ):
            await session.execute(delete(model))
        await session.commit()


async def register(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct horse battery staple",
            "password_confirmation": "correct horse battery staple",
            "locale": "ja",
        },
    )
    assert response.status_code == 201
    return client.cookies["douga_csrf"]


async def test_project_assistant_conversation_and_tenant_isolation() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as owner,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
    ):
        csrf = await register(owner, "assistant-owner@example.com")
        outsider_csrf = await register(outsider, "assistant-outsider@example.com")
        created = await owner.post(
            "/api/v1/projects",
            json={"name": "Assistant project", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        project_id = created.json()["project"]["id"]

        thread = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads",
            json={},
            headers={"X-CSRF-Token": csrf},
        )
        assert thread.status_code == 201
        thread_id = thread.json()["id"]

        hidden = await outsider.get(f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}")
        assert hidden.status_code == 404

        turn = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}/messages",
            json={"content": "プロットを一緒に考えて"},
            headers={"X-CSRF-Token": csrf},
        )
        assert turn.status_code == 202
        assert turn.json()["status"] == "queued"
        run_id = turn.json()["run_id"]

        run = await owner.get(f"/api/v1/projects/{project_id}/assistant/runs/{run_id}")
        assert run.status_code == 200
        assert run.json()["status"] == "completed"

        stream = await owner.get(f"/api/v1/projects/{project_id}/assistant/runs/{run_id}/events")
        assert stream.status_code == 200
        assert "event: message.delta" in stream.text
        assert "event: run.completed" in stream.text

        resumed = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{run_id}/events",
            headers={"Last-Event-ID": "2"},
        )
        assert resumed.status_code == 200
        assert "id: 1\n" not in resumed.text
        assert "id: 2\n" not in resumed.text

        detail = await owner.get(f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}")
        assert [item["role"] for item in detail.json()["messages"]] == [
            "user",
            "assistant",
        ]
        assert "目的" in detail.json()["messages"][1]["content"]

        second_thread = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads",
            json={"title": "Second conversation"},
            headers={"X-CSRF-Token": csrf},
        )
        assert second_thread.status_code == 201
        assert second_thread.json()["id"] != thread_id
        thread_list = await owner.get(f"/api/v1/projects/{project_id}/assistant/threads")
        assert len(thread_list.json()["items"]) == 2

        creative_turn = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads/{second_thread.json()['id']}/messages",
            json={"content": "プロットを作って保存して"},
            headers={"X-CSRF-Token": csrf},
        )
        assert creative_turn.status_code == 202
        creative_run_id = creative_turn.json()["run_id"]
        creative_run = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{creative_run_id}"
        )
        assert creative_run.json()["status"] == "completed"
        creative_events = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{creative_run_id}/events"
        )
        assert "event: tool.requested" in creative_events.text
        assert "event: tool.completed" in creative_events.text
        assert "event: artifact.created" in creative_events.text
        documents = await owner.get(f"/api/v1/projects/{project_id}/creative-documents")
        assert documents.status_code == 200
        assert documents.json()["items"][0]["kind"] == "plot"
        assert documents.json()["items"][0]["status"] == "proposed"

        async with session_factory() as session:
            consultation_tool_calls = await session.scalar(
                select(func.count())
                .select_from(AssistantToolCall)
                .where(AssistantToolCall.run_id == run_id)
            )
        assert consultation_tool_calls == 0

        edit_turn = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads/{second_thread.json()['id']}/messages",
            json={"content": "テキスト「Hello AI」を追加して"},
            headers={"X-CSRF-Token": csrf},
        )
        edit_run_id = edit_turn.json()["run_id"]
        edit_run = await owner.get(f"/api/v1/projects/{project_id}/assistant/runs/{edit_run_id}")
        assert edit_run.json()["status"] == "completed"
        assert edit_run.json()["base_revision_number"] == 1
        assert edit_run.json()["result_revision_number"] == 2
        edited_project = await owner.get(f"/api/v1/projects/{project_id}")
        assert edited_project.json()["document"]["scenes"][0]["layers"][0]["text"] == "Hello AI"
        edit_events = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{edit_run_id}/events"
        )
        assert "event: project.revision_created" in edit_events.text

        hidden_undo = await outsider.post(
            f"/api/v1/projects/{project_id}/assistant/runs/{edit_run_id}/undo",
            headers={"X-CSRF-Token": outsider_csrf},
        )
        assert hidden_undo.status_code == 404
        undone = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/runs/{edit_run_id}/undo",
            headers={"X-CSRF-Token": csrf},
        )
        assert undone.status_code == 200
        assert undone.json()["revision_number"] == 3
        restored_project = await owner.get(f"/api/v1/projects/{project_id}")
        assert restored_project.json()["document"]["scenes"][0]["layers"] == []
        repeated_undo = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/runs/{edit_run_id}/undo",
            headers={"X-CSRF-Token": csrf},
        )
        assert repeated_undo.status_code == 409
        assert repeated_undo.json()["error"]["code"] == "ASSISTANT_RUN_ALREADY_UNDONE"
        persisted_history = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/threads/{second_thread.json()['id']}"
        )
        persisted_edit_run = next(
            item for item in persisted_history.json()["runs"] if item["id"] == edit_run_id
        )
        assert persisted_edit_run["undo_revision_number"] == 3

        conflicting_turn = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads/{second_thread.json()['id']}/messages",
            json={"content": "テキスト「Will conflict」を追加して"},
            headers={"X-CSRF-Token": csrf},
        )
        conflicting_run_id = conflicting_turn.json()["run_id"]
        after_ai = await owner.get(f"/api/v1/projects/{project_id}")
        manual_document = after_ai.json()["document"]
        manual_document["name"] = "Manual edit after AI"
        manual_save = await owner.post(
            f"/api/v1/projects/{project_id}/revisions",
            json={
                "lock_version": after_ai.json()["project"]["lock_version"],
                "document": manual_document,
                "change_summary": "manual edit after AI",
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert manual_save.status_code == 200
        undo_conflict = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/runs/{conflicting_run_id}/undo",
            headers={"X-CSRF-Token": csrf},
        )
        assert undo_conflict.status_code == 409
        assert undo_conflict.json()["error"]["code"] == "ASSISTANT_UNDO_CONFLICT"

        hidden_run = await outsider.get(f"/api/v1/projects/{project_id}/assistant/runs/{run_id}")
        assert hidden_run.status_code == 404

        async with session_factory() as session:
            owner_user = (
                await session.scalars(
                    select(User).where(User.email == "assistant-owner@example.com")
                )
            ).one()
            queued = await AssistantService(session).start_run(
                project_id,
                second_thread.json()["id"],
                owner_user.id,
                "cancel this run",
            )
            queued_run_id = queued.run.id

        cancelled = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/runs/{queued_run_id}/cancel",
            headers={"X-CSRF-Token": csrf},
        )
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        cancel_stream = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{queued_run_id}/events"
        )
        assert "event: run.cancelled" in cancel_stream.text
