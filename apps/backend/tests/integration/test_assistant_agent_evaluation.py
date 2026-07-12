import json
import os
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

import pytest
from douga.api_main import create_app
from douga.core.config import get_settings
from douga.core.errors import ApplicationError
from douga.db.session import session_factory
from douga.integrations.openai_responses import (
    AssistantProviderMessage,
    AssistantProviderResult,
    AssistantProviderTool,
    AssistantProviderToolCall,
)
from douga.modules.assets.models import Asset, AssetDerivative, AssetTag, Tag
from douga.modules.assistant.creative_service import CreativeDocumentService
from douga.modules.assistant.models import (
    AssistantMessage,
    AssistantRun,
    AssistantRunEvent,
    AssistantThread,
    AssistantToolCall,
    CreativeDocument,
)
from douga.modules.assistant.orchestrator import AssistantOrchestrator
from douga.modules.assistant.service import AssistantService
from douga.modules.auth.models import User, UserSession
from douga.modules.exports.models import Export
from douga.modules.image_generations.models import ImageGenerationRequest
from douga.modules.jobs.models import Job
from douga.modules.projects.models import Project, ProjectAsset, ProjectRevision
from douga.modules.projects.service import ProjectService
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="integration database not configured"
)


class DraftEvaluationProvider:
    steps: tuple[tuple[str, dict[str, Any]], ...] = (
        ("get_creative_document", {"kind": "storyboard"}),
        ("get_project_context", {}),
        ("extend_timeline", {"duration_ms": 8_000}),
        (
            "add_shape_clip",
            {
                "name": "Opening panel",
                "x": 120,
                "y": 120,
                "width": 1680,
                "height": 840,
                "rotation": 0,
                "opacity": 1,
                "start_ms": 0,
                "end_ms": 8_000,
                "shape": "rectangle",
                "fill": "#16324f",
            },
        ),
        (
            "add_caption_clip",
            {
                "text": "小さな工場が未来をつくる",
                "speaker": None,
                "start_ms": 500,
                "duration_ms": 3_000,
                "display_effect": "fade",
            },
        ),
        (
            "apply_camera_effect",
            {
                "preset": "breathe",
                "start_ms": 0,
                "end_ms": 8_000,
                "intensity": 0.5,
                "period_ms": 4_000,
            },
        ),
        ("validate_timeline", {}),
        ("inspect_frame", {"time_ms": 1_500}),
    )

    def __init__(self) -> None:
        self.instructions = ""

    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
        tools: tuple[AssistantProviderTool, ...] = (),
        continuation: tuple[dict[str, Any], ...] = (),
    ) -> AssistantProviderResult:
        del messages
        self.instructions = instructions
        available = {tool.name for tool in tools}
        completed = sum(item.get("type") == "function_call_output" for item in continuation)
        if completed < len(self.steps):
            name, arguments = self.steps[completed]
            assert name in available
            call_id = f"draft-step-{completed}"
            return AssistantProviderResult(
                content="",
                response_id=f"draft-response-{completed}",
                usage={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
                tool_calls=(AssistantProviderToolCall(call_id, name, arguments),),
                output_items=(
                    {
                        "type": "function_call",
                        "call_id": call_id,
                        "name": name,
                        "arguments": json.dumps(arguments, ensure_ascii=False),
                    },
                ),
            )
        content = "ドラフトを作成し、タイムラインと代表フレームを検証しました。"
        if on_delta:
            await on_delta(content)
        return AssistantProviderResult(
            content=content,
            response_id="draft-final",
            usage={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        )


class ExcessUsageProvider:
    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
        tools: tuple[AssistantProviderTool, ...] = (),
        continuation: tuple[dict[str, Any], ...] = (),
    ) -> AssistantProviderResult:
        del messages, instructions, on_delta, tools, continuation
        return AssistantProviderResult(
            content="too expensive",
            usage={"input_tokens": 15, "output_tokens": 10, "total_tokens": 25},
        )


class PlotDraftEvaluationProvider(DraftEvaluationProvider):
    steps = (
        ("get_creative_document", {"kind": "plot"}),
        ("get_project_context", {}),
        (
            "add_text_clip",
            {
                "name": "Plot message",
                "x": 180,
                "y": 180,
                "width": 1560,
                "height": 240,
                "rotation": 0,
                "opacity": 1,
                "start_ms": 3_500,
                "end_ms": 7_500,
                "text": "技術と人が未来をつくる",
                "font_size": 72,
                "color": "#ffffff",
            },
        ),
        ("validate_timeline", {}),
        ("inspect_frame", {"time_ms": 4_000}),
    )


class RepeatedInvalidToolProvider:
    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
        tools: tuple[AssistantProviderTool, ...] = (),
        continuation: tuple[dict[str, Any], ...] = (),
    ) -> AssistantProviderResult:
        del messages, instructions, on_delta
        assert "add_text_clip" in {tool.name for tool in tools}
        completed = sum(item.get("type") == "function_call_output" for item in continuation)
        call_id = f"invalid-{completed}"
        return AssistantProviderResult(
            content="",
            tool_calls=(AssistantProviderToolCall(call_id, "add_text_clip", {}),),
            output_items=(
                {
                    "type": "function_call",
                    "call_id": call_id,
                    "name": "add_text_clip",
                    "arguments": "{}",
                },
            ),
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


async def test_approved_storyboard_is_built_with_multiple_tools_and_validated() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        registered = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "agent-eval@example.com",
                "password": "correct horse battery staple",
                "password_confirmation": "correct horse battery staple",
                "locale": "ja",
            },
        )
        csrf = registered.cookies["douga_csrf"]
        created = await client.post(
            "/api/v1/projects",
            json={"name": "Agent evaluation", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        project_id = UUID(created.json()["project"]["id"])

    provider = DraftEvaluationProvider()
    async with session_factory() as session:
        user = (
            await session.scalars(select(User).where(User.email == "agent-eval@example.com"))
        ).one()
        await CreativeDocumentService(session).save(
            project_id,
            user.id,
            kind="storyboard",
            status="approved",
            content={
                "title": "Factory introduction",
                "shots": [
                    {
                        "id": "shot-1",
                        "start_ms": 0,
                        "end_ms": 8_000,
                        "description": "工場と働く人を紹介する",
                        "asset_requirements": [],
                        "camera": {"preset": "breathe", "intensity": 0.5},
                        "script_block_ids": [],
                    }
                ],
            },
        )
        service = AssistantService(session, provider)
        thread = await service.create_thread(project_id, user.id, "Draft evaluation")
        started = await service.start_run(
            project_id,
            thread.id,
            user.id,
            "採用済みの絵コンテから動画ドラフトを作成して",
        )
        await service.process_run(started.run.id)
        run = await service.get_run(project_id, started.run.id, user.id)
        calls = await service.repository.list_tool_calls(run.id, user.id)
        detail = await ProjectService(session).get_project(project_id, user.id)

    assert run.status == "completed"
    assert [call.tool_name for call in calls] == [name for name, _ in provider.steps]
    assert all(call.status == "completed" for call in calls)
    assert run.usage_json == {"input_tokens": 90, "output_tokens": 45, "total_tokens": 135}
    assert detail.document["video"]["duration_ms"] == 8_000
    assert detail.document["scenes"][0]["layers"][0]["name"] == "Opening panel"
    assert detail.document["scenes"][0]["dialogues"][0]["text"].startswith("小さな工場")
    assert detail.document["camera_effects"][0]["preset"] == "breathe"
    assert "approved script or storyboard" in provider.instructions

    plot_provider = PlotDraftEvaluationProvider()
    async with session_factory() as session:
        user = (
            await session.scalars(select(User).where(User.email == "agent-eval@example.com"))
        ).one()
        await CreativeDocumentService(session).save(
            project_id,
            user.id,
            kind="plot",
            status="approved",
            content={
                "title": "People and technology",
                "logline": "技術を支える人の姿から会社の価値を伝える",
                "sections": [
                    {
                        "id": "message",
                        "title": "未来へのメッセージ",
                        "summary": "技術と人の協働を見せる",
                        "purpose": "会社の中心価値を伝える",
                        "duration_ms": 4_000,
                    }
                ],
            },
        )
        service = AssistantService(session, plot_provider)
        thread = await service.create_thread(project_id, user.id, "Plot draft evaluation")
        started = await service.start_run(
            project_id,
            thread.id,
            user.id,
            "採用済みプロットからドラフトを仕上げて",
        )
        await service.process_run(started.run.id)
        plot_run = await service.get_run(project_id, started.run.id, user.id)
        plot_calls = await service.repository.list_tool_calls(plot_run.id, user.id)
        plot_detail = await ProjectService(session).get_project(project_id, user.id)

    assert plot_run.status == "completed"
    assert [call.tool_name for call in plot_calls] == [name for name, _ in plot_provider.steps]
    assert plot_detail.document["scenes"][0]["layers"][-1]["text"] == ("技術と人が未来をつくる")


async def test_run_and_token_limits_are_enforced_and_auditable() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        registered = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "agent-limit@example.com",
                "password": "correct horse battery staple",
                "password_confirmation": "correct horse battery staple",
                "locale": "ja",
            },
        )
        csrf = registered.cookies["douga_csrf"]
        created = await client.post(
            "/api/v1/projects",
            json={"name": "Agent limits", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        project_id = UUID(created.json()["project"]["id"])

    settings = get_settings().model_copy(
        update={"assistant_token_limit_per_run": 20, "assistant_run_limit_per_hour": 1}
    )
    async with session_factory() as session:
        user = (
            await session.scalars(select(User).where(User.email == "agent-limit@example.com"))
        ).one()
        service = AssistantService(session, ExcessUsageProvider())
        service.settings = settings
        thread = await service.create_thread(project_id, user.id, "Limits")
        started = await service.start_run(project_id, thread.id, user.id, "expensive request")
        await AssistantOrchestrator(session, ExcessUsageProvider(), settings).process(
            started.run.id
        )
        run = await service.get_run(project_id, started.run.id, user.id)
        assert run.status == "failed"
        assert run.error_code == "ASSISTANT_TOKEN_LIMIT_EXCEEDED"
        assert run.usage_json["total_tokens"] == 25
        with pytest.raises(ApplicationError) as caught:
            await service.start_run(project_id, thread.id, user.id, "one more request")
        assert caught.value.code == "ASSISTANT_RUN_QUOTA_EXCEEDED"


async def test_invalid_tool_arguments_get_only_one_self_correction() -> None:
    await clear_data()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        registered = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "agent-correction@example.com",
                "password": "correct horse battery staple",
                "password_confirmation": "correct horse battery staple",
                "locale": "ja",
            },
        )
        csrf = registered.cookies["douga_csrf"]
        created = await client.post(
            "/api/v1/projects",
            json={"name": "Agent correction", "content_locale": "ja"},
            headers={"X-CSRF-Token": csrf},
        )
        project_id = UUID(created.json()["project"]["id"])

    async with session_factory() as session:
        user = (
            await session.scalars(select(User).where(User.email == "agent-correction@example.com"))
        ).one()
        service = AssistantService(session, RepeatedInvalidToolProvider())
        thread = await service.create_thread(project_id, user.id, "Correction")
        started = await service.start_run(project_id, thread.id, user.id, "テキストを追加して")
        await service.process_run(started.run.id)
        run = await service.get_run(project_id, started.run.id, user.id)
        calls = await service.repository.list_tool_calls(run.id, user.id)

    assert run.status == "failed"
    assert run.error_code == "ASSISTANT_TOOL_CORRECTION_EXCEEDED"
    assert len(calls) == 2
    assert all(call.status == "failed" for call in calls)
