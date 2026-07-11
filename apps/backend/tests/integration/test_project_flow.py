import os
from uuid import UUID

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from douga.modules.auth.models import User, UserSession
from douga.modules.projects.models import Project, ProjectRevision
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="integration database not configured"
)


async def clear_project_data() -> None:
    async with session_factory() as session:
        await session.execute(delete(ProjectRevision))
        await session.execute(delete(Project))
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
            json={"name": "First project", "content_locale": "ja"},
            headers={"X-CSRF-Token": owner_csrf},
        )
        assert created.status_code == 201
        detail = created.json()
        project_id = UUID(detail["project"]["id"])
        assert detail["project"]["current_revision_number"] == 1
        assert detail["document"]["project_id"] == str(project_id)

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
