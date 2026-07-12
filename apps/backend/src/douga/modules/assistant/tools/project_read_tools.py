from typing import Any, Literal

from pydantic import Field

from douga.modules.assets.service import AssetService
from douga.modules.assistant.creative_service import CreativeDocumentService
from douga.modules.assistant.tools.project_tool_service import (
    ProjectToolService,
    StrictToolArgs,
    canvas,
    empty_parameters,
    find_clip,
    model_parameters,
    validate_time_range,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
)


class ListAssetsArgs(StrictToolArgs):
    search: str | None = Field(max_length=200)
    kind: Literal["image", "video", "audio"] | None
    limit: int = Field(ge=1, le=100)


class TimelineArgs(StrictToolArgs):
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)


class ClipDetailsArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)


async def get_project_context(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    del arguments
    service = ProjectToolService(context)
    detail = await service.detail()
    run = await service.run()
    document = detail.document
    scene = canvas(document)
    creative = await CreativeDocumentService(context.session).list_approved(
        context.project_id, context.user_id
    )
    return ToolExecutionResult(
        data={
            "project": {
                "id": str(detail.project.id),
                "name": detail.project.name,
                "content_locale": detail.project.content_locale,
                "current_revision_number": detail.project.current_revision_number,
                "video": document["video"],
                "caption_style": document["caption_style"],
                "layer_count": len(scene["layers"]),
                "caption_count": len(scene["dialogues"]),
                "audio_track_count": len(document.get("audio_tracks", [])),
                "camera_effect_count": len(document.get("camera_effects", [])),
            },
            "editor_context": run.context_json,
            "approved_creative_documents": [
                {
                    "id": str(item.id),
                    "kind": item.kind,
                    "version": item.version,
                    "content": item.content,
                }
                for item in creative
            ],
        }
    )


def overlaps(item: dict[str, Any], start_ms: int, end_ms: int, duration_ms: int) -> bool:
    item_start = int(item.get("start_ms", 0))
    item_end = int(item.get("end_ms", item_start + int(item.get("duration_ms") or duration_ms)))
    return item_start < end_ms and item_end > start_ms


async def get_timeline_summary(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = TimelineArgs.model_validate(arguments)
    validate_time_range(values.start_ms, values.end_ms)
    detail = await ProjectToolService(context).detail()
    document = detail.document
    scene = canvas(document)
    duration_ms = int(document["video"].get("duration_ms", 5000))
    return ToolExecutionResult(
        data={
            "range": {"start_ms": values.start_ms, "end_ms": values.end_ms},
            "layers": [
                item
                for item in scene["layers"]
                if overlaps(item, values.start_ms, values.end_ms, duration_ms)
            ],
            "captions": [
                item
                for item in scene["dialogues"]
                if overlaps(item, values.start_ms, values.end_ms, duration_ms)
            ],
            "audio_tracks": [
                item
                for item in document.get("audio_tracks", [])
                if overlaps(item, values.start_ms, values.end_ms, duration_ms)
            ],
            "camera_effects": [
                item
                for item in document.get("camera_effects", [])
                if overlaps(item, values.start_ms, values.end_ms, duration_ms)
            ],
        }
    )


async def get_clip_details(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = ClipDetailsArgs.model_validate(arguments)
    detail = await ProjectToolService(context).detail()
    document = detail.document
    kind, clip, _ = find_clip(document, values.clip_id)
    return ToolExecutionResult(data={"kind": kind, "clip": clip})


async def list_assets(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = ListAssetsArgs.model_validate(arguments)
    result = await AssetService(context.session).list_assets(
        context.user_id,
        search=values.search,
        kind=values.kind,
        status="ready",
        limit=values.limit,
    )
    return ToolExecutionResult(
        data={
            "items": [
                {
                    "id": str(item.id),
                    "kind": item.kind,
                    "name": item.name,
                    "width": item.width,
                    "height": item.height,
                    "duration_ms": item.duration_ms,
                    "tags": item.tags,
                }
                for item in result.items
            ],
            "total": result.total,
        }
    )


def project_read_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="get_project_context",
            description=(
                "Read video settings, current editor selection and approved creative documents "
                "before planning or editing."
            ),
            parameters=empty_parameters(),
            handler=get_project_context,
        ),
        ToolDefinition(
            name="get_timeline_summary",
            description="Read clips overlapping a time range and identify occupied or empty areas.",
            parameters=model_parameters(TimelineArgs),
            handler=get_timeline_summary,
        ),
        ToolDefinition(
            name="get_clip_details",
            description=(
                "Read the complete validated details for one layer, caption, audio or camera clip."
            ),
            parameters=model_parameters(ClipDetailsArgs),
            handler=get_clip_details,
        ),
        ToolDefinition(
            name="list_assets",
            description="List the current user's ready assets before placing or replacing media.",
            parameters=model_parameters(ListAssetsArgs),
            handler=list_assets,
        ),
    )
