import os
from datetime import UTC, datetime, timedelta

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="integration database not configured"
)


async def clear_data() -> None:
    async with session_factory() as session:
        await session.execute(text("TRUNCATE TABLE users CASCADE"))
        await session.commit()


async def register(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "api-token-owner@example.com",
            "password": "correct horse battery staple",
            "password_confirmation": "correct horse battery staple",
            "locale": "ja",
        },
    )
    assert response.status_code == 201
    return client.cookies["douga_csrf"]


async def test_api_token_issue_scope_authentication_and_revocation() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as browser:
        csrf = await register(browser)
        issued = await browser.post(
            "/api/v1/settings/api-tokens",
            headers={"X-CSRF-Token": csrf},
            json={
                "name": "NovelCreator Codex",
                "scopes": ["projects:read", "projects:write"],
            },
        )
        assert issued.status_code == 201
        body = issued.json()
        plaintext = body["token"]
        assert plaintext.startswith("dga_pat_")
        assert body["token_prefix"] != plaintext

        listing = await browser.get("/api/v1/settings/api-tokens")
        assert listing.status_code == 200
        assert listing.json()["items"][0].get("token") is None

        token_client = AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {plaintext}"},
        )
        async with token_client:
            created = await token_client.post(
                "/api/v1/projects",
                json={"name": "Created by Codex", "content_locale": "ja"},
                headers={"Idempotency-Key": "api-token-project-0001"},
            )
            assert created.status_code == 201
            operation_id = created.headers["X-Automation-Operation-ID"]
            replayed = await token_client.post(
                "/api/v1/projects",
                json={"name": "Created by Codex", "content_locale": "ja"},
                headers={"Idempotency-Key": "api-token-project-0001"},
            )
            assert replayed.status_code == 201
            assert replayed.headers["X-Idempotent-Replay"] == "true"
            assert replayed.headers["X-Automation-Operation-ID"] != operation_id
            assert replayed.json()["project"]["id"] == created.json()["project"]["id"]

            conflict = await token_client.post(
                "/api/v1/projects",
                json={"name": "Different request", "content_locale": "ja"},
                headers={"Idempotency-Key": "api-token-project-0001"},
            )
            assert conflict.status_code == 409
            assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

            operation = await token_client.get(f"/api/v1/automation/operations/{operation_id}")
            assert operation.status_code == 200
            assert operation.json()["project_id"] == created.json()["project"]["id"]
            assert (await token_client.get("/api/v1/projects")).status_code == 200

            denied = await token_client.get("/api/v1/assets")
            assert denied.status_code == 403
            assert denied.json()["error"]["code"] == "API_TOKEN_SCOPE_REQUIRED"

        assets_token_response = await browser.post(
            "/api/v1/settings/api-tokens",
            headers={"X-CSRF-Token": csrf},
            json={"name": "Asset reader", "scopes": ["assets:read"]},
        )
        assert assets_token_response.status_code == 201
        async with AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {assets_token_response.json()['token']}"},
        ) as assets_client:
            wrong_scope = await assets_client.get(f"/api/v1/automation/operations/{operation_id}")
            assert wrong_scope.status_code == 403
            assert wrong_scope.json()["error"]["code"] == "API_TOKEN_SCOPE_REQUIRED"

        ambiguous = await browser.get(
            "/api/v1/projects", headers={"Authorization": f"Bearer {plaintext}"}
        )
        assert ambiguous.status_code == 401
        assert ambiguous.json()["error"]["code"] == "AUTH_AMBIGUOUS"

        ambiguous_post = await browser.post(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {plaintext}"},
            json={"name": "Must not run", "content_locale": "ja"},
        )
        assert ambiguous_post.status_code == 401
        assert ambiguous_post.json()["error"]["code"] == "AUTH_AMBIGUOUS"

        revoked = await browser.delete(
            f"/api/v1/settings/api-tokens/{body['id']}",
            headers={"X-CSRF-Token": csrf},
        )
        assert revoked.status_code == 204

        rejected = await browser.get(
            "/api/v1/projects",
            headers={
                "Authorization": f"Bearer {plaintext}",
                "Cookie": "",
            },
        )
        assert rejected.status_code == 401
        assert rejected.json()["error"]["code"] == "API_TOKEN_INVALID"

    await clear_data()


async def test_expired_idempotency_key_can_be_reused() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as browser:
        csrf = await register(browser)
        issued = await browser.post(
            "/api/v1/settings/api-tokens",
            headers={"X-CSRF-Token": csrf},
            json={"name": "Codex", "scopes": ["projects:write"]},
        )
        token = issued.json()["token"]
        async with AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {token}"},
        ) as token_client:
            headers = {"Idempotency-Key": "expired-project-key-0001"}
            first = await token_client.post(
                "/api/v1/projects",
                headers=headers,
                json={"name": "First", "content_locale": "ja"},
            )
            assert first.status_code == 201
            async with session_factory() as session:
                await session.execute(
                    text(
                        "UPDATE api_idempotency_records SET expires_at = :expired WHERE key = :key"
                    ),
                    {
                        "expired": datetime.now(UTC) - timedelta(seconds=1),
                        "key": "expired-project-key-0001",
                    },
                )
                await session.commit()
            second = await token_client.post(
                "/api/v1/projects",
                headers=headers,
                json={"name": "Second", "content_locale": "ja"},
            )
            assert second.status_code == 201
            assert second.json()["project"]["id"] != first.json()["project"]["id"]
    await clear_data()


async def test_api_token_management_requires_browser_csrf() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as browser:
        await register(browser)
        rejected = await browser.post(
            "/api/v1/settings/api-tokens",
            json={"name": "No CSRF", "scopes": ["projects:read"]},
        )
        assert rejected.status_code == 403
        assert rejected.json()["error"]["code"] == "CSRF_INVALID"
    await clear_data()


async def test_assistant_api_supports_personal_tokens_with_dedicated_scopes() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as browser:
        csrf = await register(browser)
        project = await browser.post(
            "/api/v1/projects",
            headers={"X-CSRF-Token": csrf},
            json={"name": "Assistant API", "content_locale": "ja"},
        )
        assert project.status_code == 201
        project_id = project.json()["project"]["id"]

        async def issue(name: str, scopes: list[str]) -> str:
            response = await browser.post(
                "/api/v1/settings/api-tokens",
                headers={"X-CSRF-Token": csrf},
                json={"name": name, "scopes": scopes},
            )
            assert response.status_code == 201
            return str(response.json()["token"])

        full_token = await issue("Assistant client", ["assistant:read", "assistant:write"])
        read_token = await issue("Assistant reader", ["assistant:read"])
        unrelated_token = await issue("Project reader", ["projects:read"])

        async with AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {full_token}"},
        ) as full_client:
            created = await full_client.post(
                f"/api/v1/projects/{project_id}/assistant/threads",
                json={"title": "REST conversation"},
                headers={"Idempotency-Key": "assistant-thread-0001"},
            )
            assert created.status_code == 201
            thread_id = created.json()["id"]
            assert (
                await full_client.get(
                    f"/api/v1/projects/{project_id}/assistant/threads/{thread_id}"
                )
            ).status_code == 200

        async with AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {read_token}"},
        ) as read_client:
            assert (
                await read_client.get(f"/api/v1/projects/{project_id}/assistant/threads")
            ).status_code == 200
            denied_write = await read_client.post(
                f"/api/v1/projects/{project_id}/assistant/threads",
                json={"title": "Must not be created"},
                headers={"Idempotency-Key": "assistant-thread-denied-0001"},
            )
            assert denied_write.status_code == 403
            assert denied_write.json()["error"]["code"] == "API_TOKEN_SCOPE_REQUIRED"

        async with AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {unrelated_token}"},
        ) as unrelated_client:
            denied_read = await unrelated_client.get(
                f"/api/v1/projects/{project_id}/assistant/threads"
            )
            assert denied_read.status_code == 403
            assert denied_read.json()["error"]["code"] == "API_TOKEN_SCOPE_REQUIRED"

    await clear_data()


async def test_transient_post_response_is_not_cached_by_idempotency() -> None:
    await clear_data()
    app = create_app()
    attempts = 0

    @app.post("/api/v1/testing/transient")
    async def transient() -> JSONResponse:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return JSONResponse({"error": {"code": "BUSY"}}, status_code=503)
        return JSONResponse({"status": "ok"})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as browser:
        csrf = await register(browser)
        issued = await browser.post(
            "/api/v1/settings/api-tokens",
            headers={"X-CSRF-Token": csrf},
            json={"name": "Codex", "scopes": ["projects:write"]},
        )
        async with AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"Authorization": f"Bearer {issued.json()['token']}"},
        ) as token_client:
            headers = {"Idempotency-Key": "transient-retry-key-0001"}
            first = await token_client.post("/api/v1/testing/transient", headers=headers)
            second = await token_client.post("/api/v1/testing/transient", headers=headers)

        assert first.status_code == 503
        assert second.status_code == 200
        assert "X-Idempotent-Replay" not in second.headers
        assert attempts == 2
    await clear_data()
