import os

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from douga.modules.assets.models import Asset, AssetDerivative, AssetTag, Tag
from douga.modules.assistant.models import AssistantMessage, AssistantRun, AssistantThread
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
        await register(outsider, "assistant-outsider@example.com")
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
        assert turn.status_code == 200
        assert turn.json()["status"] == "completed"
        assert "目的" in turn.json()["assistant_message"]["content"]

        detail = await owner.get(f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}")
        assert [item["role"] for item in detail.json()["messages"]] == [
            "user",
            "assistant",
        ]
