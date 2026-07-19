import os
from collections.abc import AsyncIterator

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
from sqlalchemy import delete, select

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="integration database not configured"
)


async def clear_auth_data() -> None:
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


async def test_register_settings_logout_flow() -> None:
    await clear_auth_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "User@Example.com",
                "password": "correct horse battery staple",
                "password_confirmation": "correct horse battery staple",
                "locale": "ja",
            },
        )
        assert response.status_code == 201
        assert response.json()["email"] == "User@example.com"
        cookies = response.headers.get_list("set-cookie")
        assert any("douga_session=" in cookie and "HttpOnly" in cookie for cookie in cookies)
        assert all("SameSite=lax" in cookie for cookie in cookies)

        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200

        initial_settings = await client.get("/api/v1/settings")
        assert initial_settings.status_code == 200
        assert initial_settings.json()["default_video_fps"] == "10.000"

        rejected = await client.patch("/api/v1/settings", json={"preferred_locale": "en"})
        assert rejected.status_code == 403
        assert rejected.json()["error"]["code"] == "CSRF_INVALID"

        csrf_token = client.cookies["douga_csrf"]
        updated = await client.patch(
            "/api/v1/settings",
            json={"preferred_locale": "en", "default_content_locale": "en"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert updated.status_code == 200
        assert updated.json()["preferred_locale"] == "en"

        changed = await client.patch(
            "/api/v1/auth/password",
            json={
                "current_password": "correct horse battery staple",
                "new_password": "new correct horse battery staple",
                "new_password_confirmation": "new correct horse battery staple",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        assert changed.status_code == 204

        logout = await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf_token})
        assert logout.status_code == 204
        assert (await client.get("/api/v1/auth/me")).status_code == 401
        old_password = await client.post(
            "/api/v1/auth/login",
            json={"email": "user@example.com", "password": "correct horse battery staple"},
        )
        assert old_password.status_code == 401
        new_password = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "user@example.com",
                "password": "new correct horse battery staple",
            },
        )
        assert new_password.status_code == 200

    async with session_factory() as session:
        user = (await session.scalars(select(User))).one()
        user_sessions = list(await session.scalars(select(UserSession)))
        assert user.email_normalized == "user@example.com"
        assert user.password_hash.startswith("$argon2id$")
        assert "correct horse" not in user.password_hash
        assert all(len(item.token_hash) == 64 for item in user_sessions)
        assert any(item.revoked_at is not None for item in user_sessions)

    await clear_auth_data()


async def test_cors_allows_csrf_header_from_web_origin() -> None:
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.options(
            "/api/v1/settings",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "PATCH",
                "Access-Control-Request-Headers": "x-csrf-token,content-type",
            },
        )

    assert response.status_code == 200
    assert "x-csrf-token" in response.headers["access-control-allow-headers"].lower()


async def test_chunked_json_body_is_rejected_at_the_configured_limit() -> None:
    async def oversized_body() -> AsyncIterator[bytes]:
        yield b'{"value":"'
        for _ in range(6):
            yield b"x" * (1024 * 1024)
        yield b'"}'

    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/auth/login",
            headers={"Content-Type": "application/json"},
            content=oversized_body(),
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"
