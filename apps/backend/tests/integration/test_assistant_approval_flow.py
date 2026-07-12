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
from douga.modules.auth.models import User, UserSession
from douga.modules.exports.models import Export
from douga.modules.image_generations.models import ImageGenerationRequest
from douga.modules.jobs.models import Job
from douga.modules.projects.models import Project, ProjectAsset, ProjectRevision
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

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


async def request_high_quality_image(
    client: AsyncClient, project_id: str, thread_id: str, csrf: str
) -> tuple[str, str]:
    turn = await client.post(
        f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}/messages",
        json={"content": "夜の町工場の高品質画像を生成して"},
        headers={"X-CSRF-Token": csrf},
    )
    assert turn.status_code == 202
    run_id = turn.json()["run_id"]
    detail = await client.get(f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}")
    call = next(item for item in detail.json()["tool_calls"] if item["run_id"] == run_id)
    assert call["status"] == "waiting_approval"
    return run_id, call["id"]


async def test_high_cost_image_approval_rejection_and_tenant_isolation() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as owner,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
    ):
        csrf = await register(owner, "approval-owner@example.com")
        outsider_csrf = await register(outsider, "approval-outsider@example.com")
        project = await owner.post(
            "/api/v1/projects",
            json={"name": "Approval project", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        project_id = project.json()["project"]["id"]
        thread = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads",
            json={},
            headers={"X-CSRF-Token": csrf},
        )
        thread_id = thread.json()["id"]

        rejected_run_id, rejected_call_id = await request_high_quality_image(
            owner, project_id, thread_id, csrf
        )
        hidden = await outsider.post(
            f"/api/v1/projects/{project_id}/assistant/tool-calls/{rejected_call_id}/approve",
            headers={"X-CSRF-Token": outsider_csrf},
        )
        assert hidden.status_code == 404
        rejected = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/tool-calls/{rejected_call_id}/reject",
            headers={"X-CSRF-Token": csrf},
        )
        assert rejected.status_code == 200
        rejected_run = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{rejected_run_id}"
        )
        assert rejected_run.json()["status"] == "completed"
        assert (await owner.get("/api/v1/image-generations")).json()["total"] == 0

        approved_run_id, approved_call_id = await request_high_quality_image(
            owner, project_id, thread_id, csrf
        )
        overlapping = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}/messages",
            json={"content": "別の処理を始めて"},
            headers={"X-CSRF-Token": csrf},
        )
        assert overlapping.status_code == 409
        assert overlapping.json()["error"]["code"] == "ASSISTANT_RUN_ACTIVE"
        approved = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/tool-calls/{approved_call_id}/approve",
            headers={"X-CSRF-Token": csrf},
        )
        assert approved.status_code == 200
        approved_run = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{approved_run_id}"
        )
        assert approved_run.json()["status"] == "completed"
        events = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{approved_run_id}/events"
        )
        assert "event: tool.waiting_approval" in events.text
        assert "event: tool.approved" in events.text
        assert "event: tool.progress" in events.text
        assert "event: artifact.created" in events.text
        generation = (await owner.get("/api/v1/image-generations")).json()
        assert generation["total"] == 1
        assert generation["items"][0]["output_asset_id"]

        export_turn = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}/messages",
            json={"content": "MP4を書き出して"},
            headers={"X-CSRF-Token": csrf},
        )
        export_run_id = export_turn.json()["run_id"]
        detail = await owner.get(f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}")
        export_call = next(
            item for item in detail.json()["tool_calls"] if item["run_id"] == export_run_id
        )
        assert export_call["tool_name"] == "export_video"
        assert export_call["status"] == "waiting_approval"
        rejected_export = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/tool-calls/{export_call['id']}/reject",
            headers={"X-CSRF-Token": csrf},
        )
        assert rejected_export.status_code == 200
        assert (await owner.get("/api/v1/exports")).json()["total"] == 0

        placed_turn = await owner.post(
            f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}/messages",
            json={"content": "朝の工場の画像を生成してタイムラインに配置して"},
            headers={"X-CSRF-Token": csrf},
        )
        placed_run = await owner.get(
            f"/api/v1/projects/{project_id}/assistant/runs/{placed_turn.json()['run_id']}"
        )
        assert placed_run.json()["status"] == "completed"
        placed_project = await owner.get(f"/api/v1/projects/{project_id}")
        placed_layer = placed_project.json()["document"]["scenes"][0]["layers"][0]
        assert placed_layer["type"] == "image"
        assert placed_layer["name"] == "AI generated image"
        assert (await owner.get("/api/v1/image-generations")).json()["total"] == 2
