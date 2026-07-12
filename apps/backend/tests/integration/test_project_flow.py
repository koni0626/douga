import os
from copy import deepcopy
from uuid import UUID

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from douga.modules.assets.models import Asset, AssetDerivative, AssetTag, Tag
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


async def clear_project_data() -> None:
    async with session_factory() as session:
        await session.execute(delete(ImageGenerationRequest))
        await session.execute(delete(Export))
        await session.execute(delete(Job))
        await session.execute(delete(ProjectAsset))
        await session.execute(delete(ProjectRevision))
        await session.execute(delete(Project))
        await session.execute(delete(AssetDerivative))
        await session.execute(delete(AssetTag))
        await session.execute(delete(Tag))
        await session.execute(delete(Asset))
        await session.execute(delete(UserSession))
        await session.execute(delete(User))
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


async def test_project_revision_conflict_duplicate_delete_and_tenant_isolation() -> None:
    await clear_project_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as owner,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
    ):
        owner_csrf = await register(owner, "project-owner@example.com")
        await register(outsider, "project-outsider@example.com")

        created = await owner.post(
            "/api/v1/projects",
            json={
                "name": "First project",
                "content_locale": "ja",
                "aspect_ratio": "9:16",
            },
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert created.status_code == 201
        detail = created.json()
        project_id = UUID(detail["project"]["id"])
        assert detail["project"]["current_revision_number"] == 1
        assert detail["document"]["project_id"] == str(project_id)
        assert detail["document"]["video"]["width"] == 1080
        assert detail["document"]["video"]["height"] == 1920
        assert detail["document"]["caption_style"] == {
            "x": 72,
            "y": 1440,
            "width": 936,
            "height": 360,
            "padding": 36,
            "font_family": "sans-serif",
            "font_size": 52,
            "font_weight": 700,
            "line_height": 1.35,
            "max_lines": 3,
            "text_color": "#ffffff",
            "background_color": "#000000",
            "background_opacity": 0.75,
            "border_radius": 24,
            "text_align": "left",
        }

        valid = await owner.post(
            f"/api/v1/projects/{project_id}/validate",
            json={"document": detail["document"]},
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert valid.status_code == 200
        assert valid.json()["valid"] is True
        assert valid.json()["estimated_duration_ms"] == 5000

        invalid_document = deepcopy(detail["document"])
        invalid_document["schema_version"] = 99
        invalid = await owner.post(
            f"/api/v1/projects/{project_id}/validate",
            json={"document": invalid_document},
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert invalid.status_code == 200
        assert invalid.json()["valid"] is False
        assert any(
            issue["code"] == "PROJECT_SCHEMA_UNSUPPORTED" for issue in invalid.json()["errors"]
        )

        malformed_document = deepcopy(detail["document"])
        malformed_document["scenes"] = ["not-an-object"]
        malformed = await owner.post(
            f"/api/v1/projects/{project_id}/validate",
            json={"document": malformed_document},
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert malformed.status_code == 200
        assert malformed.json()["valid"] is False
        assert any(
            issue["code"] == "PROJECT_SCHEMA_INVALID" for issue in malformed.json()["errors"]
        )

        hidden = await outsider.get(f"/api/v1/projects/{project_id}")
        assert hidden.status_code == 404

        saved = await owner.post(
            f"/api/v1/projects/{project_id}/revisions",
            json={
                "lock_version": 0,
                "document": detail["document"],
                "change_summary": "integration save",
            },
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert saved.status_code == 200
        assert saved.json()["project"]["current_revision_number"] == 2
        assert saved.json()["project"]["lock_version"] == 1

        conflict = await owner.post(
            f"/api/v1/projects/{project_id}/revisions",
            json={"lock_version": 0, "document": detail["document"]},
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "PROJECT_CONFLICT"

        duplicate = await owner.post(
            f"/api/v1/projects/{project_id}/duplicate",
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert duplicate.status_code == 200
        assert duplicate.json()["project"]["current_revision_number"] == 1
        assert duplicate.json()["document"]["project_id"] != str(project_id)

        deleted = await owner.delete(
            f"/api/v1/projects/{project_id}", headers={"X-CSRF-Token": owner_csrf}
        )
        assert deleted.status_code == 204
        assert (await owner.get(f"/api/v1/projects/{project_id}")).status_code == 404
        listing = await owner.get("/api/v1/projects")
        assert listing.status_code == 200
        assert listing.json()["total"] == 1

    await clear_project_data()
