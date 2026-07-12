import base64
import os
from uuid import UUID

import pytest
from douga.api_main import create_app
from douga.core.errors import NotFoundError
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
from douga.modules.assistant.service import AssistantService
from douga.modules.assistant.tools.project_read_tools import project_read_tool_definitions
from douga.modules.assistant.tools.registry import ToolContext, ToolRegistry
from douga.modules.assistant.tools.timeline_tools import timeline_tool_definitions
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

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
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


async def test_project_read_and_edit_tools_create_owned_revisions() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as client,
        AsyncClient(transport=transport, base_url="http://testserver") as outsider,
    ):
        csrf = await register(client, "tool-owner@example.com")
        outsider_csrf = await register(outsider, "tool-outsider@example.com")
        created = await client.post(
            "/api/v1/projects",
            json={"name": "Tool project", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        project_id = UUID(created.json()["project"]["id"])
        upload = await client.post(
            "/api/v1/assets/uploads",
            json={"name": "Pixel", "original_filename": "pixel.png", "kind": "image"},
            headers={"X-CSRF-Token": csrf},
        )
        asset_id = upload.json()["asset"]["id"]
        await client.put(
            f"/api/v1/assets/{asset_id}/content",
            content=PNG_1X1,
            headers={"X-CSRF-Token": csrf, "Content-Type": "application/octet-stream"},
        )
        assert (
            await client.post(
                f"/api/v1/assets/{asset_id}/complete",
                headers={"X-CSRF-Token": csrf},
            )
        ).status_code == 200
        outsider_upload = await outsider.post(
            "/api/v1/assets/uploads",
            json={"name": "Hidden", "original_filename": "hidden.png", "kind": "image"},
            headers={"X-CSRF-Token": outsider_csrf},
        )
        outsider_asset_id = outsider_upload.json()["asset"]["id"]
        await outsider.put(
            f"/api/v1/assets/{outsider_asset_id}/content",
            content=PNG_1X1,
            headers={"X-CSRF-Token": outsider_csrf, "Content-Type": "application/octet-stream"},
        )
        await outsider.post(
            f"/api/v1/assets/{outsider_asset_id}/complete",
            headers={"X-CSRF-Token": outsider_csrf},
        )

        async with session_factory() as session:
            user = (
                await session.scalars(select(User).where(User.email == "tool-owner@example.com"))
            ).one()
            service = AssistantService(session)
            thread = await service.create_thread(project_id, user.id, "Tools")
            started = await service.start_run(
                project_id,
                thread.id,
                user.id,
                "edit",
                {
                    "time_ms": 1200,
                    "selected_layer_id": None,
                    "visible_start_ms": 0,
                    "visible_end_ms": 5000,
                },
            )
            context = ToolContext(
                session=session,
                run_id=started.run.id,
                project_id=project_id,
                user_id=user.id,
            )
            tools = ToolRegistry(project_read_tool_definitions() + timeline_tool_definitions())

            summary = await tools.execute("get_project_context", context, {})
            assert summary.data["project"]["layer_count"] == 0
            assert summary.data["editor_context"]["time_ms"] == 1200
            assets = await tools.execute(
                "list_assets", context, {"search": None, "kind": "image", "limit": 10}
            )
            assert assets.data["items"][0]["id"] == asset_id
            with pytest.raises(NotFoundError):
                await tools.execute(
                    "add_asset_to_timeline",
                    context,
                    {
                        "asset_id": outsider_asset_id,
                        "name": "Must stay hidden",
                        "x": 0,
                        "y": 0,
                        "width": 100,
                        "height": 100,
                        "rotation": 0,
                        "opacity": 1,
                        "start_ms": 0,
                        "end_ms": 5000,
                    },
                )

            shape = await tools.execute(
                "add_shape_clip",
                context,
                {
                    "name": "Blue panel",
                    "x": 10,
                    "y": 20,
                    "width": 400,
                    "height": 200,
                    "rotation": 0,
                    "opacity": 1,
                    "start_ms": 0,
                    "end_ms": 5000,
                    "shape": "rectangle",
                    "fill": "#3388ff",
                },
            )
            shape_id = shape.data["clip_id"]
            shape_details = await tools.execute("get_clip_details", context, {"clip_id": shape_id})
            assert shape_details.data["clip"]["fill"] == "#3388ff"
            await tools.execute(
                "add_caption_clip",
                context,
                {
                    "text": "A timed caption",
                    "speaker": None,
                    "start_ms": 1000,
                    "duration_ms": 2000,
                    "display_effect": "fade",
                },
            )
            image = await tools.execute(
                "add_asset_to_timeline",
                context,
                {
                    "asset_id": asset_id,
                    "name": "Pixel",
                    "x": 100,
                    "y": 100,
                    "width": 500,
                    "height": 500,
                    "rotation": 0,
                    "opacity": 1,
                    "start_ms": 0,
                    "end_ms": 5000,
                },
            )
            image_id = image.data["clip_id"]
            await tools.execute(
                "replace_clip_asset",
                context,
                {"clip_id": image_id, "asset_id": asset_id},
            )
            await tools.execute(
                "update_clip_transform",
                context,
                {
                    "clip_id": shape_id,
                    "x": 50,
                    "y": 60,
                    "width": 300,
                    "height": 150,
                    "rotation": 15,
                    "opacity": 0.8,
                    "flip_x": False,
                    "flip_y": True,
                    "locked": False,
                },
            )
            await tools.execute(
                "update_clip_content",
                context,
                {
                    "clip_id": shape_id,
                    "name": "Renamed panel",
                    "text": None,
                    "color": "#2244aa",
                    "font_size": None,
                },
            )
            await tools.execute(
                "update_clip_timing",
                context,
                {
                    "clip_id": shape_id,
                    "start_ms": 500,
                    "end_ms": 4500,
                    "track_id": "shape-track",
                    "z_index": 1,
                },
            )
            timeline = await tools.execute(
                "get_timeline_summary", context, {"start_ms": 0, "end_ms": 5000}
            )
            assert len(timeline.data["layers"]) == 2
            assert len(timeline.data["captions"]) == 1
            with pytest.raises(NotFoundError):
                await tools.execute(
                    "add_audio_clip",
                    context,
                    {
                        "asset_id": asset_id,
                        "role": "bgm",
                        "start_ms": 0,
                        "duration_ms": 5000,
                        "trim_start_ms": 0,
                        "volume": 1,
                        "loop": False,
                        "fade_in_ms": 0,
                        "fade_out_ms": 0,
                        "ducking": False,
                    },
                )
            await tools.execute("delete_clip", context, {"clip_id": shape_id})
            await tools.execute("extend_timeline", context, {"duration_ms": 10_000})

        detail = await client.get(f"/api/v1/projects/{project_id}")
        assert detail.json()["project"]["current_revision_number"] == 10
        scene = detail.json()["document"]["scenes"][0]
        assert [layer["type"] for layer in scene["layers"]] == ["image"]
        assert scene["dialogues"][0]["text"] == "A timed caption"
