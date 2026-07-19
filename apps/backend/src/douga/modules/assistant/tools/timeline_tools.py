from copy import deepcopy
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from douga.core.errors import ApplicationError, ConflictError
from douga.modules.assets.service import AssetService
from douga.modules.assistant.tools.project_tool_service import (
    ProjectToolService,
    StrictToolArgs,
    canvas,
    find_clip,
    find_layer,
    model_parameters,
    mutation_result,
    validate_time_range,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
    ToolHandler,
)


class TimedBoxArgs(StrictToolArgs):
    name: str = Field(min_length=1, max_length=200)
    x: float
    y: float
    width: float = Field(gt=0, le=7680)
    height: float = Field(gt=0, le=4320)
    rotation: float = Field(ge=-3600, le=3600)
    opacity: float = Field(ge=0, le=1)
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)


class AddTextArgs(TimedBoxArgs):
    text: str = Field(max_length=20_000)
    font_size: float = Field(gt=0, le=1000)
    color: str = Field(min_length=1, max_length=100)


class AddShapeArgs(TimedBoxArgs):
    shape: Literal["rectangle", "ellipse"]
    fill: str = Field(min_length=1, max_length=100)


class AddAssetArgs(TimedBoxArgs):
    asset_id: UUID


class AddCaptionArgs(StrictToolArgs):
    text: str = Field(min_length=1, max_length=20_000)
    speaker: str | None = Field(max_length=100)
    start_ms: int = Field(ge=0, le=3_600_000)
    duration_ms: int = Field(gt=0, le=3_600_000)
    display_effect: Literal["instant", "fade", "typewriter"]


class AddAudioArgs(StrictToolArgs):
    asset_id: UUID
    role: Literal["narration", "bgm", "effect"]
    start_ms: int = Field(ge=0, le=3_600_000)
    duration_ms: int = Field(gt=0, le=3_600_000)
    trim_start_ms: int = Field(ge=0, le=3_600_000)
    volume: float = Field(ge=0, le=2)
    loop: bool
    fade_in_ms: int = Field(ge=0, le=3_600_000)
    fade_out_ms: int = Field(ge=0, le=3_600_000)
    ducking: bool


class DuplicateAudioClipArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)


class ClipTimingArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)
    track_id: str | None = Field(max_length=100)
    z_index: int | None = Field(ge=0, le=999)


class ClipTransformArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)
    x: float
    y: float
    width: float = Field(gt=0, le=7680)
    height: float = Field(gt=0, le=4320)
    rotation: float = Field(ge=-3600, le=3600)
    opacity: float = Field(ge=0, le=1)
    flip_x: bool
    flip_y: bool
    locked: bool


class ClipContentArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)
    name: str | None = Field(max_length=200)
    text: str | None = Field(max_length=20_000)
    color: str | None = Field(max_length=100)
    font_size: float | None = Field(gt=0, le=1000)


class ReplaceAssetArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)
    asset_id: UUID


class DeleteClipArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)


class ExtendTimelineArgs(StrictToolArgs):
    duration_ms: int = Field(ge=100, le=3_600_000)


def layer_base(values: TimedBoxArgs, layer_id: str, layer_type: str) -> dict[str, Any]:
    return {
        "id": layer_id,
        "track_id": str(uuid4()),
        "type": layer_type,
        **values.model_dump(mode="json"),
        "flip_x": False,
        "flip_y": False,
        "locked": False,
        "keyframes": [],
    }


async def add_text_clip(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = AddTextArgs.model_validate(arguments)
    validate_time_range(values.start_ms, values.end_ms)
    layer_id = str(uuid4())

    def mutate(document: dict[str, Any]) -> None:
        canvas(document)["layers"].append(layer_base(values, layer_id, "text"))

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: add text clip")
    return mutation_result(detail, run, {"clip_id": layer_id})


async def add_shape_clip(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = AddShapeArgs.model_validate(arguments)
    validate_time_range(values.start_ms, values.end_ms)
    layer_id = str(uuid4())

    def mutate(document: dict[str, Any]) -> None:
        canvas(document)["layers"].append(layer_base(values, layer_id, "shape"))

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: add shape clip")
    return mutation_result(detail, run, {"clip_id": layer_id})


async def add_asset_to_timeline(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = AddAssetArgs.model_validate(arguments)
    validate_time_range(values.start_ms, values.end_ms)
    await AssetService(context.session).assert_ready_kind(values.asset_id, context.user_id, "image")
    layer_id = str(uuid4())

    def mutate(document: dict[str, Any]) -> None:
        payload = layer_base(values, layer_id, "image")
        payload["asset_id"] = str(values.asset_id)
        canvas(document)["layers"].append(payload)

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: add asset clip")
    return mutation_result(detail, run, {"clip_id": layer_id})


async def add_caption_clip(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = AddCaptionArgs.model_validate(arguments)
    clip_id = str(uuid4())

    def mutate(document: dict[str, Any]) -> None:
        canvas(document)["dialogues"].append(
            {
                "id": clip_id,
                "speaker": values.speaker,
                "start_ms": values.start_ms,
                "text": values.text,
                "display_effect": values.display_effect,
                "duration_mode": "manual",
                "duration_ms": values.duration_ms,
                "manual_page_breaks": [],
            }
        )

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: add caption clip")
    return mutation_result(detail, run, {"clip_id": clip_id})


async def add_audio_clip(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = AddAudioArgs.model_validate(arguments)
    await AssetService(context.session).assert_ready_kind(values.asset_id, context.user_id, "audio")
    clip_id = str(uuid4())

    def mutate(document: dict[str, Any]) -> None:
        payload = values.model_dump(mode="json")
        payload["asset_id"] = str(values.asset_id)
        document.setdefault("audio_tracks", []).append(
            {"id": clip_id, **payload, "scene_id": None, "dialogue_id": None}
        )

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: add audio clip")
    return mutation_result(detail, run, {"clip_id": clip_id})


async def duplicate_audio_clip(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = DuplicateAudioClipArgs.model_validate(arguments)
    validate_time_range(values.start_ms, values.end_ms)
    project_tools = ProjectToolService(context)
    current_detail = await project_tools.detail()
    kind, source, _ = find_clip(current_detail.document, values.clip_id)
    if kind != "audio":
        raise ApplicationError("CLIP_TYPE_INVALID", "errors.assistantToolArgumentsInvalid", 422)
    source_duration_ms = int(source.get("duration_ms") or 0)
    if source_duration_ms <= 0:
        raise ApplicationError(
            "AUDIO_DURATION_INVALID", "errors.assistantToolArgumentsInvalid", 422
        )
    video_duration_ms = int(current_detail.document["video"].get("duration_ms", 5_000))
    if values.end_ms > video_duration_ms:
        raise ApplicationError(
            "AUDIO_RANGE_OUT_OF_TIMELINE", "errors.assistantToolArgumentsInvalid", 422
        )
    copy_count = (
        values.end_ms - values.start_ms + source_duration_ms - 1
    ) // source_duration_ms
    if copy_count > 200:
        raise ApplicationError(
            "AUDIO_DUPLICATE_LIMIT_EXCEEDED", "errors.assistantToolArgumentsInvalid", 422
        )
    asset_id = UUID(str(source["asset_id"]))
    await AssetService(context.session).assert_ready_kind(asset_id, context.user_id, "audio")
    clip_ids = [str(uuid4()) for _ in range(copy_count)]

    def mutate(document: dict[str, Any]) -> None:
        current_kind, current_source, _ = find_clip(document, values.clip_id)
        if current_kind != "audio":
            raise ApplicationError(
                "CLIP_TYPE_INVALID", "errors.assistantToolArgumentsInvalid", 422
            )
        tracks = document.setdefault("audio_tracks", [])
        cursor_ms = values.start_ms
        for clip_id in clip_ids:
            duration_ms = min(source_duration_ms, values.end_ms - cursor_ms)
            payload = deepcopy(current_source)
            payload.update(
                {
                    "id": clip_id,
                    "start_ms": cursor_ms,
                    "duration_ms": duration_ms,
                    "fade_in_ms": min(int(payload.get("fade_in_ms", 0)), duration_ms),
                    "fade_out_ms": min(int(payload.get("fade_out_ms", 0)), duration_ms),
                    "scene_id": None,
                    "dialogue_id": None,
                }
            )
            tracks.append(payload)
            cursor_ms += duration_ms

    detail, run = await project_tools.mutate(mutate, "AI: duplicate audio clip")
    return mutation_result(
        detail,
        run,
        {
            "source_clip_id": values.clip_id,
            "clip_ids": clip_ids,
            "start_ms": values.start_ms,
            "end_ms": values.end_ms,
        },
    )


async def update_clip_timing(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = ClipTimingArgs.model_validate(arguments)
    validate_time_range(values.start_ms, values.end_ms)

    def mutate(document: dict[str, Any]) -> None:
        kind, clip, collection = find_clip(document, values.clip_id)
        clip["start_ms"] = values.start_ms
        if kind in {"caption", "audio"}:
            clip["duration_ms"] = values.end_ms - values.start_ms
        else:
            clip["end_ms"] = values.end_ms
        if kind == "layer" and values.track_id is not None:
            clip["track_id"] = values.track_id
        if kind == "layer" and values.z_index is not None:
            collection.remove(clip)
            collection.insert(min(values.z_index, len(collection)), clip)

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: update clip timing")
    return mutation_result(detail, run, {"clip_id": values.clip_id})


async def update_clip_transform(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = ClipTransformArgs.model_validate(arguments)

    def mutate(document: dict[str, Any]) -> None:
        layer = find_layer(document, values.clip_id)
        if layer.get("locked") and values.locked:
            raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
        for key, value in values.model_dump(exclude={"clip_id"}).items():
            layer[key] = value

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: update transform")
    return mutation_result(detail, run, {"clip_id": values.clip_id})


async def update_clip_content(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = ClipContentArgs.model_validate(arguments)
    if all(value is None for key, value in values.model_dump().items() if key != "clip_id"):
        raise ApplicationError(
            "ASSISTANT_TOOL_ARGUMENTS_INVALID", "errors.assistantToolArgumentsInvalid", 422
        )

    def mutate(document: dict[str, Any]) -> None:
        kind, clip, _ = find_clip(document, values.clip_id)
        if kind == "layer" and clip.get("locked"):
            raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
        if values.name is not None and kind == "layer":
            clip["name"] = values.name
        if values.text is not None and (kind == "caption" or clip.get("type") == "text"):
            clip["text"] = values.text
        if values.color is not None and clip.get("type") in {"text", "shape"}:
            clip["color" if clip.get("type") == "text" else "fill"] = values.color
        if values.font_size is not None and clip.get("type") == "text":
            clip["font_size"] = values.font_size

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: update clip content")
    return mutation_result(detail, run, {"clip_id": values.clip_id})


async def replace_clip_asset(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = ReplaceAssetArgs.model_validate(arguments)
    await AssetService(context.session).assert_ready_kind(values.asset_id, context.user_id, "image")

    def mutate(document: dict[str, Any]) -> None:
        layer = find_layer(document, values.clip_id)
        if layer.get("type") != "image":
            raise ApplicationError("CLIP_TYPE_INVALID", "errors.assistantToolArgumentsInvalid", 422)
        if layer.get("locked"):
            raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
        layer["asset_id"] = str(values.asset_id)

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: replace clip asset")
    return mutation_result(detail, run, {"clip_id": values.clip_id})


async def delete_clip(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = DeleteClipArgs.model_validate(arguments)

    def mutate(document: dict[str, Any]) -> None:
        kind, clip, collection = find_clip(document, values.clip_id)
        if kind == "layer" and clip.get("locked"):
            raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
        collection[:] = [item for item in collection if item["id"] != values.clip_id]

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: delete clip")
    return mutation_result(detail, run, {"deleted_clip_id": values.clip_id})


async def extend_timeline(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = ExtendTimelineArgs.model_validate(arguments)

    def mutate(document: dict[str, Any]) -> None:
        current = int(document["video"].get("duration_ms", 5000))
        if values.duration_ms <= current:
            raise ConflictError("TIMELINE_NOT_EXTENDED", "errors.assistantToolArgumentsInvalid")
        document["video"]["duration_ms"] = values.duration_ms

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: extend timeline")
    return mutation_result(detail, run, {"duration_ms": values.duration_ms})


def definition(
    name: str,
    description: str,
    model: type[BaseModel],
    handler: ToolHandler,
    *,
    approval_required: bool = False,
) -> ToolDefinition:
    return ToolDefinition(
        name=name,
        description=description,
        parameters=model_parameters(model),
        handler=handler,
        approval_required=approval_required,
    )


def timeline_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        definition("add_text_clip", "Add one free text clip.", AddTextArgs, add_text_clip),
        definition(
            "add_caption_clip",
            "Add one timed telop/caption clip.",
            AddCaptionArgs,
            add_caption_clip,
        ),
        definition(
            "add_shape_clip", "Add one rectangle or ellipse clip.", AddShapeArgs, add_shape_clip
        ),
        definition(
            "add_audio_clip", "Add one user-owned audio asset clip.", AddAudioArgs, add_audio_clip
        ),
        definition(
            "duplicate_audio_clip",
            (
                "Repeat an existing audio clip contiguously to fill an exact timeline range. "
                "Preserve its asset and audio settings, and trim the final copy to end_ms."
            ),
            DuplicateAudioClipArgs,
            duplicate_audio_clip,
        ),
        definition(
            "add_asset_to_timeline",
            "Place one user-owned image asset.",
            AddAssetArgs,
            add_asset_to_timeline,
        ),
        definition(
            "replace_clip_asset",
            "Replace an image clip with another owned asset.",
            ReplaceAssetArgs,
            replace_clip_asset,
        ),
        definition(
            "update_clip_timing",
            "Change a clip's time range and optional layer track.",
            ClipTimingArgs,
            update_clip_timing,
        ),
        definition(
            "update_clip_transform",
            "Change a layer's transform, flips, opacity and lock.",
            ClipTransformArgs,
            update_clip_transform,
        ),
        definition(
            "update_clip_content",
            "Change text, name, color or font size where applicable.",
            ClipContentArgs,
            update_clip_content,
        ),
        definition(
            "delete_clip",
            "Delete one clip after an explicit request and user approval.",
            DeleteClipArgs,
            delete_clip,
            approval_required=True,
        ),
        definition(
            "extend_timeline",
            "Increase the total video duration.",
            ExtendTimelineArgs,
            extend_timeline,
        ),
    )
