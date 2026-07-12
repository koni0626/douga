from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from douga.core.errors import ApplicationError
from douga.db.session import session_factory
from douga.modules.assistant.tools.project_tool_service import (
    StrictToolArgs,
    model_parameters,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
)
from douga.modules.image_generations.service import (
    ImageGenerationService,
    process_image_generation_job,
)


class GenerateImageArgs(StrictToolArgs):
    prompt: str = Field(min_length=1, max_length=4_000)
    quality: Literal["low", "medium", "high"]
    size: Literal["1024x1024", "1024x1536", "1536x1024"]


class GenerationStatusArgs(StrictToolArgs):
    request_id: UUID


async def generate_image(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = GenerateImageArgs.model_validate(arguments)
    service = ImageGenerationService(context.session)
    result = await service.create(
        context.user_id,
        prompt=values.prompt,
        quality=values.quality,
        size=values.size,
    )
    if context.emit_progress:
        await context.emit_progress(
            {"progress": 1, "request_id": str(result.id), "status": "queued"}
        )
    await process_image_generation_job(result.job_id)
    # The worker intentionally uses its own transaction. Read its committed result in a
    # fresh session so the orchestrator's Run and ToolCall instances remain usable.
    async with session_factory() as result_session:
        completed = await ImageGenerationService(result_session).get(result.id, context.user_id)
    if completed.status != "succeeded" or completed.output_asset_id is None:
        raise ApplicationError(
            completed.error_code or "IMAGE_GENERATION_FAILED",
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
        "prompt": completed.prompt,
        "size": completed.size,
        "quality": completed.quality,
    }
    return ToolExecutionResult(
        data={"generation": artifact},
        artifact=artifact,
    )


async def list_generation_status(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = GenerationStatusArgs.model_validate(arguments)
    result = await ImageGenerationService(context.session).get(values.request_id, context.user_id)
    return ToolExecutionResult(
        data={
            "generation": {
                "request_id": str(result.id),
                "status": result.status,
                "progress": result.progress,
                "output_asset_id": (
                    str(result.output_asset_id) if result.output_asset_id else None
                ),
                "error_code": result.error_code,
            }
        }
    )


def asset_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="generate_image",
            description=(
                "Generate one image as a private user asset. High quality requires explicit user "
                "approval because it has a higher external API cost."
            ),
            parameters=model_parameters(GenerateImageArgs),
            handler=generate_image,
            approval_policy=lambda arguments: arguments.get("quality") == "high",
        ),
        ToolDefinition(
            name="list_generation_status",
            description="Read the status and output asset ID of one owned image generation.",
            parameters=model_parameters(GenerationStatusArgs),
            handler=list_generation_status,
        ),
    )
