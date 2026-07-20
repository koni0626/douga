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


def plot_content(title: str = "Factory revival") -> dict[str, object]:
    return {
        "title": title,
        "logline": "AI導入で町工場が再生する",
        "sections": [
            {
                "id": "opening",
                "title": "問題提起",
                "summary": "受注減少に悩む現場",
                "purpose": "課題への共感",
                "duration_ms": 6000,
            }
        ],
    }


async def test_creative_document_versions_adoption_and_tenant_isolation() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as owner,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
    ):
        csrf = await register(owner, "creative-owner@example.com")
        await register(outsider, "creative-outsider@example.com")
        project = await owner.post(
            "/api/v1/projects",
            json={"name": "Creative project", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        project_id = project.json()["project"]["id"]

        missing_csrf = await owner.post(
            f"/api/v1/projects/{project_id}/creative-documents",
            json={"kind": "plot", "status": "proposed", "content": plot_content()},
        )
        assert missing_csrf.status_code == 403

        proposed = await owner.post(
            f"/api/v1/projects/{project_id}/creative-documents",
            json={"kind": "plot", "status": "proposed", "content": plot_content()},
            headers={"X-CSRF-Token": csrf},
        )
        assert proposed.status_code == 201
        assert proposed.json()["version"] == 1

        adopted = await owner.post(
            f"/api/v1/projects/{project_id}/creative-documents/{proposed.json()['id']}/adopt",
            headers={"X-CSRF-Token": csrf},
        )
        assert adopted.status_code == 200
        assert adopted.json()["status"] == "approved"
        assert adopted.json()["version"] == 2

        draft = await owner.post(
            f"/api/v1/projects/{project_id}/creative-documents",
            json={
                "kind": "plot",
                "status": "draft",
                "content": plot_content("Alternative"),
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert draft.json()["version"] == 3
        latest_list = await owner.get(f"/api/v1/projects/{project_id}/creative-documents")
        assert latest_list.json()["items"][0]["version"] == 3
        preferred = await owner.get(f"/api/v1/projects/{project_id}/creative-documents/plot")
        assert preferred.json()["version"] == 3

        invalid = await owner.post(
            f"/api/v1/projects/{project_id}/creative-documents",
            json={"kind": "plot", "content": {"title": "Incomplete"}},
            headers={"X-CSRF-Token": csrf},
        )
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "CREATIVE_DOCUMENT_INVALID"

        hidden = await outsider.get(f"/api/v1/projects/{project_id}/creative-documents")
        assert hidden.status_code == 404
        hidden_adopt = await outsider.post(
            f"/api/v1/projects/{project_id}/creative-documents/{draft.json()['id']}/adopt",
            headers={"X-CSRF-Token": outsider.cookies["douga_csrf"]},
        )
        assert hidden_adopt.status_code == 404
