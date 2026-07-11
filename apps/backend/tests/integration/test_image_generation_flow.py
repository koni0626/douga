import os

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from douga.modules.assets.models import Asset
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
        await session.execute(delete(Export))
        await session.execute(delete(ProjectAsset))
        await session.execute(delete(ProjectRevision))
        await session.execute(delete(Project))
        await session.execute(delete(ImageGenerationRequest))
        await session.execute(delete(Job))
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


async def test_fake_generation_creates_private_asset_and_history() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as owner,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
    ):
        csrf = await register(owner, "image-owner@example.com")
        await register(outsider, "image-outsider@example.com")
        created = await owner.post(
            "/api/v1/image-generations",
            json={"prompt": "青い空と白い雲", "quality": "low", "size": "1024x1024"},
            headers={"X-CSRF-Token": csrf},
        )
        assert created.status_code == 202
        request_id = created.json()["id"]

        result = await owner.get(f"/api/v1/image-generations/{request_id}")
        assert result.status_code == 200
        assert result.json()["status"] == "succeeded"
        asset_id = result.json()["output_asset_id"]
        assert asset_id
        assert (await owner.get(f"/api/v1/assets/{asset_id}/content")).status_code == 200
        assert (await outsider.get(f"/api/v1/assets/{asset_id}/content")).status_code == 404
        assert (await outsider.get(f"/api/v1/image-generations/{request_id}")).status_code == 404
        history = await owner.get("/api/v1/image-generations")
        assert history.json()["items"][0]["prompt"] == "青い空と白い雲"

    await clear_data()
