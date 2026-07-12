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


async def test_fixed_revision_export_download_and_tenant_isolation() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver", timeout=90) as owner,
        AsyncClient(transport=transport, base_url="http://testserver", timeout=90) as outsider,
    ):
        csrf = await register(owner, "export-owner@example.com")
        await register(outsider, "export-outsider@example.com")
        created = await owner.post(
            "/api/v1/projects",
            json={"name": "Short export", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        detail = created.json()
        project_id = detail["project"]["id"]
        document = detail["document"]
        document["video"] = {"width": 320, "height": 180, "fps": 10}
        document["caption_style"].update(
            {"x": 10, "y": 100, "width": 300, "height": 70, "font_size": 18}
        )
        document["scenes"] = [
            {
                "id": "scene-1",
                "name": "Opening",
                "background": {"type": "color", "color": "#17203b"},
                "layers": [],
                "dialogues": [
                    {
                        "id": "dialogue-1",
                        "speaker": None,
                        "text": "テスト動画",
                        "display_effect": "instant",
                        "duration_mode": "manual",
                        "duration_ms": 1000,
                        "manual_page_breaks": [],
                    }
                ],
            }
        ]
        saved = await owner.post(
            f"/api/v1/projects/{project_id}/revisions",
            json={"lock_version": 0, "document": document},
            headers={"X-CSRF-Token": csrf},
        )
        assert saved.status_code == 200
        exported = await owner.post(
            "/api/v1/exports",
            json={"project_id": project_id},
            headers={"X-CSRF-Token": csrf},
        )
        assert exported.status_code == 202
        export_id = exported.json()["id"]
        result = await owner.get(f"/api/v1/exports/{export_id}")
        assert result.json()["status"] == "succeeded"
        assert result.json()["duration_ms"] == 5000
        video = await owner.get(f"/api/v1/exports/{export_id}/content")
        assert video.status_code == 200
        assert video.headers["content-type"].startswith("video/mp4")
        assert video.content[4:8] == b"ftyp"
        assert (await outsider.get(f"/api/v1/exports/{export_id}")).status_code == 404
        assert (await outsider.get(f"/api/v1/exports/{export_id}/content")).status_code == 404

        preview = await owner.post(
            f"/api/v1/projects/{project_id}/previews",
            json={
                "revision_number": 2,
                "range_start_ms": 1_000,
                "range_end_ms": 2_500,
                "width": 320,
                "height": 240,
                "fps": 10,
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert preview.status_code == 202
        preview_id = preview.json()["id"]
        completed = await owner.get(f"/api/v1/projects/{project_id}/previews/{preview_id}")
        assert completed.json()["status"] == "succeeded"
        assert completed.json()["kind"] == "preview"
        assert completed.json()["duration_ms"] == 1_500
        assert completed.json()["width"] == 320
        preview_video = await owner.get(
            f"/api/v1/projects/{project_id}/previews/{preview_id}/content"
        )
        assert preview_video.status_code == 200
        assert preview_video.content[4:8] == b"ftyp"
        assert (
            await outsider.get(f"/api/v1/projects/{project_id}/previews/{preview_id}")
        ).status_code == 404

    await clear_data()
