from typing import Any, Literal, cast
from uuid import UUID

from pydantic import Field

from douga.core.errors import ApplicationError, ConflictError
from douga.db.session import session_factory
from douga.modules.assistant.tools.project_tool_service import (
    ProjectToolService,
    StrictToolArgs,
    canvas,
    find_layer,
    model_parameters,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
)
from douga.modules.image_generations.schemas import ImageGenerationResponse
from douga.modules.image_generations.service import (
    ImageGenerationService,
    process_image_generation_job,
)


class EditImageAssetArgs(StrictToolArgs):
    source_asset_id: UUID
    prompt: str = Field(min_length=1, max_length=4_000)
    quality: Literal["low", "medium", "high"]
    size: Literal["1024x1024", "1024x1536", "1536x1024"]


class EditVisibleImageArgs(StrictToolArgs):
    layer_name: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=4_000)
    quality: Literal["low", "medium", "high"]
    size: Literal["1024x1024", "1024x1536", "1536x1024"]


def visible_image_layers(document: dict[str, Any], time_ms: int) -> list[dict[str, Any]]:
    duration_ms = int(document["video"].get("duration_ms", 5_000))
    return [
        cast(dict[str, Any], layer)
        for layer in canvas(document)["layers"]
        if layer.get("type") == "image"
        and int(layer.get("start_ms", 0)) <= time_ms
        and time_ms < int(layer.get("end_ms", duration_ms))
    ]


def select_visible_image_layer(
    document: dict[str, Any], time_ms: int, layer_name: str
) -> dict[str, Any]:
    requested = layer_name.strip().casefold()
    matches = [
        layer
        for layer in visible_image_layers(document, time_ms)
        if str(layer.get("name", "")).strip().casefold() == requested
    ]
    if not matches:
        raise ApplicationError(
            "VISIBLE_IMAGE_LAYER_NOT_FOUND",
            "errors.assistantToolArgumentsInvalid",
            422,
        )
    if len(matches) > 1:
        raise ApplicationError(
            "VISIBLE_IMAGE_LAYER_AMBIGUOUS",
            "errors.assistantToolArgumentsInvalid",
            422,
        )
    return matches[0]


async def _complete_edit(
    context: ToolContext, values: EditImageAssetArgs | EditVisibleImageArgs, source_asset_id: UUID
) -> tuple[ImageGenerationResponse, dict[str, Any]]:
    result = await ImageGenerationService(context.session).create_edit(
        context.user_id,
        parent_asset_id=source_asset_id,
        prompt=values.prompt,
        quality=values.quality,
        size=values.size,
    )
    if context.emit_progress:
        await context.emit_progress(
            {"progress": 1, "request_id": str(result.id), "status": "queued"}
        )
    await process_image_generation_job(result.job_id)
    async with session_factory() as result_session:
        completed = await ImageGenerationService(result_session).get(result.id, context.user_id)
    if completed.status != "succeeded" or completed.output_asset_id is None:
        raise ApplicationError(
            completed.error_code or "IMAGE_EDIT_FAILED",
            "errors.imageGenerationFailed",
            502,
        )
    if context.emit_progress:
        await context.emit_progress(
            {"progress": 100, "request_id": str(completed.id), "status": "succeeded"}
        )
    artifact = {
        "artifact_type": "image",
        "request_id": str(completed.id),
        "asset_id": str(completed.output_asset_id),
        "source_asset_id": str(source_asset_id),
        "prompt": completed.prompt,
        "size": completed.size,
        "quality": completed.quality,
    }
    return completed, artifact


async def edit_image_asset(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = EditImageAssetArgs.model_validate(arguments)
    _, artifact = await _complete_edit(context, values, values.source_asset_id)
    return ToolExecutionResult(data={"generation": artifact}, artifact=artifact)


async def edit_visible_image(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = EditVisibleImageArgs.model_validate(arguments)
    project_tools = ProjectToolService(context)
    detail = await project_tools.detail()
    run = await project_tools.run()
    time_ms = int(run.context_json.get("time_ms", 0))
    source_layer = select_visible_image_layer(detail.document, time_ms, values.layer_name)
    if source_layer.get("locked"):
        raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
    layer_id = str(source_layer["id"])
    source_asset_id = UUID(str(source_layer["asset_id"]))
    completed, artifact = await _complete_edit(context, values, source_asset_id)
    output_asset_id = completed.output_asset_id
    if output_asset_id is None:
        raise RuntimeError("Completed image edit has no output asset")

    def replace_source(document: dict[str, Any]) -> None:
        layer = find_layer(document, layer_id)
        if layer.get("locked"):
            raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
        if str(layer.get("asset_id")) != str(source_asset_id):
            raise ConflictError("ASSISTANT_PROJECT_CONFLICT", "errors.assistantProjectConflict")
        layer["asset_id"] = str(output_asset_id)

    saved, updated_run = await project_tools.mutate(replace_source, "AI: edit visible image")
    return ToolExecutionResult(
        data={
            "generation": artifact,
            "layer_id": layer_id,
            "layer_name": values.layer_name,
            "revision_number": saved.project.current_revision_number,
        },
        artifact=artifact,
        revision_number=updated_run.result_revision_number,
    )


def image_edit_tool_definitions() -> tuple[ToolDefinition, ...]:
    def high_quality(arguments: dict[str, Any]) -> bool:
        return arguments.get("quality") == "high"

    return (
        ToolDefinition(
            name="edit_image_asset",
            description=(
                "Create a new edited image asset from one exact user-owned source asset. "
                "Use list_assets first when the user identifies an upload by name."
            ),
            parameters=model_parameters(EditImageAssetArgs),
            handler=edit_image_asset,
            approval_policy=high_quality,
        ),
        ToolDefinition(
            name="edit_visible_image",
            description=(
                "Edit and replace one currently visible image layer selected by its exact layer "
                "name. Inspect the current frame first. Never call this when multiple visible "
                "images exist and the user has not specified a layer name; ask the user instead."
            ),
            parameters=model_parameters(EditVisibleImageArgs),
            handler=edit_visible_image,
            approval_policy=high_quality,
        ),
    )
