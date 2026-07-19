import base64
import io
import os
import wave
from hashlib import sha256

import pytest
from douga.api_main import create_app
from douga.db.session import session_factory
from douga.integrations.aivis_speech import AivisSpeechClient
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

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


async def clear_all_data() -> None:
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


async def test_image_upload_validation_tags_and_tenant_isolation() -> None:
    await clear_all_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as owner,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
    ):
        csrf = await register(owner, "asset-owner@example.com")
        await register(outsider, "asset-outsider@example.com")
        started = await owner.post(
            "/api/v1/assets/uploads",
            json={
                "name": "Pixel",
                "original_filename": "pixel.png",
                "kind": "image",
                "content_type": "image/png",
                "size_bytes": len(PNG_1X1),
                "sha256": sha256(PNG_1X1).hexdigest(),
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert started.status_code == 201
        asset_id = started.json()["asset"]["id"]

        uploaded = await owner.put(
            f"/api/v1/assets/{asset_id}/content",
            content=PNG_1X1,
            headers={"X-CSRF-Token": csrf, "Content-Type": "application/octet-stream"},
        )
        assert uploaded.status_code == 200
        assert uploaded.json()["status"] == "processing"

        completed = await owner.post(
            f"/api/v1/assets/{asset_id}/complete", headers={"X-CSRF-Token": csrf}
        )
        assert completed.status_code == 200
        assert completed.json()["mime_type"] == "image/png"
        assert completed.json()["width"] == 1
        assert completed.json()["height"] == 1

        updated = await owner.patch(
            f"/api/v1/assets/{asset_id}",
            json={"name": "Tagged pixel", "tags": ["背景", "Sample"]},
            headers={"X-CSRF-Token": csrf},
        )
        assert updated.status_code == 200
        assert updated.json()["tags"] == ["Sample", "背景"]
        assert (await owner.get(f"/api/v1/assets/{asset_id}/content")).content == PNG_1X1
        assert (await outsider.get(f"/api/v1/assets/{asset_id}/content")).status_code == 404

        mismatch = await owner.post(
            "/api/v1/assets/uploads",
            json={
                "name": "Bad hash",
                "original_filename": "bad.png",
                "kind": "image",
                "size_bytes": len(PNG_1X1),
                "sha256": "0" * 64,
            },
            headers={"X-CSRF-Token": csrf},
        )
        mismatch_id = mismatch.json()["asset"]["id"]
        rejected = await owner.put(
            f"/api/v1/assets/{mismatch_id}/content",
            content=PNG_1X1,
            headers={"X-CSRF-Token": csrf},
        )
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "UPLOAD_HASH_MISMATCH"

        deleted = await owner.delete(f"/api/v1/assets/{asset_id}", headers={"X-CSRF-Token": csrf})
        assert deleted.status_code == 204
        remaining = (await owner.get("/api/v1/assets")).json()
        assert remaining["total"] == 1
        assert remaining["items"][0]["status"] == "failed"

    await clear_all_data()


async def test_generated_speech_is_private_to_the_authenticated_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await clear_all_data()

    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(24_000)
        stream.writeframes(b"\0\0" * 4_800)
    generated_wav = output.getvalue()

    async def fake_synthesize(self: AivisSpeechClient, **_: object) -> bytes:
        return generated_wav

    monkeypatch.setattr(AivisSpeechClient, "synthesize", fake_synthesize)
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as owner,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
        AsyncClient(transport=transport, base_url="http://testserver") as anonymous,
    ):
        csrf = await register(owner, "speech-owner@example.com")
        await register(outsider, "speech-outsider@example.com")
        created = await owner.post(
            "/api/v1/speech/syntheses",
            json={"text": "こんにちは", "style_id": 42},
            headers={"X-CSRF-Token": csrf},
        )
        assert created.status_code == 201
        asset = created.json()["asset"]
        assert asset["source"] == "generated"
        assert asset["kind"] == "audio"
        assert asset["duration_ms"] == 200
        assert (await owner.get(f"/api/v1/assets/{asset['id']}/content")).content == generated_wav
        assert (await outsider.get(f"/api/v1/assets/{asset['id']}/content")).status_code == 404
        assert (
            await anonymous.post("/api/v1/speech/syntheses", json={"text": "拒否", "style_id": 42})
        ).status_code == 401

    await clear_all_data()
