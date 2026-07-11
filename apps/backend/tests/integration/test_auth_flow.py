import os

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from douga.modules.auth.models import User, UserSession
from douga.modules.projects.models import Project, ProjectRevision
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="integration database not configured"
)


async def clear_auth_data() -> None:
    async with session_factory() as session:
        await session.execute(delete(ProjectRevision))
        await session.execute(delete(Project))
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

        logout = await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf_token})
        assert logout.status_code == 204
        assert (await client.get("/api/v1/auth/me")).status_code == 401

    async with session_factory() as session:
        user = (await session.scalars(select(User))).one()
        user_session = (await session.scalars(select(UserSession))).one()
        assert user.email_normalized == "user@example.com"
        assert user.password_hash.startswith("$argon2id$")
        assert "correct horse" not in user.password_hash
        assert len(user_session.token_hash) == 64
        assert user_session.revoked_at is not None

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
