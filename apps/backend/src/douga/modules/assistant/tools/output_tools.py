from typing import Any
from uuid import UUID

from pydantic import Field

from douga.core.errors import ApplicationError
from douga.db.session import session_factory
from douga.modules.assets.repository import AssetRepository
from douga.modules.assistant.tools.project_tool_service import (
    ProjectToolService,
    StrictToolArgs,
    canvas,
    empty_parameters,
    model_parameters,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
)
from douga.modules.exports.service import ExportService, process_export_job


class PreviewArgs(StrictToolArgs):
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)


async def validate_timeline(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    del arguments
    detail = await ProjectToolService(context).detail()
    document = detail.document
    scene = canvas(document)
    duration_ms = int(document["video"].get("duration_ms", 5_000))
    issues: list[dict[str, Any]] = []
    referenced_assets: set[UUID] = set()

    def issue(code: str, severity: str, clip_id: str | None, **details: Any) -> None:
        issues.append({"code": code, "severity": severity, "clip_id": clip_id, "details": details})

    def asset_id(value: object, clip_id: str | None) -> None:
        try:
            referenced_assets.add(UUID(str(value)))
        except ValueError, TypeError:
            issue("invalid_asset_id", "error", clip_id, asset_id=value)

    background = scene["background"]
    if background.get("type") == "asset":
        asset_id(background.get("asset_id"), None)

    timed: list[tuple[str, dict[str, Any]]] = []
    for item in scene["layers"]:
        timed.append(("layer", item))
        if item.get("type") == "image":
            asset_id(item.get("asset_id"), str(item.get("id")))
    for item in scene["dialogues"]:
        timed.append(("caption", item))
        if not str(item.get("text", "")).strip():
            issue("empty_caption", "warning", str(item.get("id")))
    for item in document.get("audio_tracks", []):
        timed.append(("audio", item))
        asset_id(item.get("asset_id"), str(item.get("id")))
    for item in document.get("camera_effects", []):
        timed.append(("camera", item))

    occupied: list[tuple[int, int]] = []
    for kind, item in timed:
        clip_id = str(item.get("id"))
        start_ms = int(item.get("start_ms", 0))
        end_ms = int(item.get("end_ms", start_ms + int(item.get("duration_ms") or duration_ms)))
        if end_ms <= start_ms:
            issue("invalid_time_range", "error", clip_id, kind=kind)
        if start_ms < 0 or end_ms > duration_ms:
            issue(
                "outside_timeline",
                "error",
                clip_id,
                kind=kind,
                start_ms=start_ms,
                end_ms=end_ms,
            )
        if kind in {"layer", "caption"} and end_ms > start_ms:
            occupied.append((max(0, start_ms), min(duration_ms, end_ms)))

    ready_ids = await AssetRepository(context.session).ready_owned_ids(
        context.user_id, referenced_assets
    )
    for missing in sorted(referenced_assets - ready_ids, key=str):
        issue("missing_asset", "error", None, asset_id=str(missing))

    empty_ranges: list[dict[str, int]] = []
    cursor = 0
    for start_ms, end_ms in sorted(occupied):
        if start_ms > cursor:
            empty_ranges.append({"start_ms": cursor, "end_ms": start_ms})
        cursor = max(cursor, end_ms)
    if cursor < duration_ms:
        empty_ranges.append({"start_ms": cursor, "end_ms": duration_ms})
    if not occupied:
        issue("timeline_has_no_visual_clips", "warning", None)

    return ToolExecutionResult(
        data={
            "valid": not any(item["severity"] == "error" for item in issues),
            "duration_ms": duration_ms,
            "issues": issues,
            "empty_visual_ranges": empty_ranges,
            "counts": {
                "layers": len(scene["layers"]),
                "captions": len(scene["dialogues"]),
                "audio_tracks": len(document.get("audio_tracks", [])),
                "camera_effects": len(document.get("camera_effects", [])),
            },
        }
    )


async def _render(
    context: ToolContext,
    *,
    kind: str,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> ToolExecutionResult:
    created = await ExportService(context.session).create(
        context.project_id,
        context.user_id,
        kind=kind,
        range_start_ms=start_ms,
        range_end_ms=end_ms,
    )
    if context.emit_progress:
        await context.emit_progress(
            {"progress": 1, "export_id": str(created.id), "status": "queued"}
        )
    await process_export_job(created.job_id)
    async with session_factory() as result_session:
        completed = await ExportService(result_session).get(created.id, context.user_id)
    if context.emit_progress:
        await context.emit_progress(
            {
                "progress": completed.progress,
                "export_id": str(completed.id),
                "status": completed.status,
            }
        )
    if completed.status != "succeeded":
        raise ApplicationError(completed.error_code or "EXPORT_FAILED", "errors.exportFailed", 502)
    artifact_type = "video_preview" if kind == "preview" else "video_export"
    artifact = {
        "artifact_type": artifact_type,
        "export_id": str(completed.id),
        "name": completed.name,
        "status": completed.status,
        "duration_ms": completed.duration_ms,
        "range_start_ms": completed.range_start_ms,
        "range_end_ms": completed.range_end_ms,
        "error_code": completed.error_code,
    }
    return ToolExecutionResult(data={"export": artifact}, artifact=artifact)


async def render_preview(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = PreviewArgs.model_validate(arguments)
    return await _render(context, kind="preview", start_ms=values.start_ms, end_ms=values.end_ms)


async def export_video(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    del arguments
    return await _render(context, kind="export")


def output_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="validate_timeline",
            description=(
                "Validate timing, missing owned assets, empty visual ranges and malformed clips. "
                "Run this before preview or export."
            ),
            parameters=empty_parameters(),
            handler=validate_timeline,
        ),
        ToolDefinition(
            name="render_preview",
            description="Render an MP4 preview of at most 15 seconds for user review.",
            parameters=model_parameters(PreviewArgs),
            handler=render_preview,
        ),
        ToolDefinition(
            name="export_video",
            description="Render the complete project as MP4 after explicit user approval.",
            parameters=empty_parameters(),
            handler=export_video,
            approval_required=True,
        ),
    )
