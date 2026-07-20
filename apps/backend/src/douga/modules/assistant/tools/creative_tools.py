from typing import Any, Literal, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from douga.modules.assistant.creative_schemas import (
    BriefContent,
    CreativeKind,
    PlotContent,
    ScriptContent,
    StoryboardContent,
)
from douga.modules.assistant.creative_service import CreativeDocumentService
from douga.modules.assistant.models import CreativeDocument
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
    ToolHandler,
)


class GetCreativeDocumentArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: CreativeKind


class UpdateCreativeStatusArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: UUID
    status: Literal["approved"]


def serialize_document(document: CreativeDocument) -> dict[str, Any]:
    return {
        "artifact_type": "creative_document",
        "id": str(document.id),
        "project_id": str(document.project_id),
        "kind": document.kind,
        "status": document.status,
        "version": document.version,
        "content": document.content,
        "source_run_id": str(document.source_run_id) if document.source_run_id else None,
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
    }


def content_parameters(model: type[BaseModel]) -> dict[str, Any]:
    content_schema = model.model_json_schema()
    definitions = content_schema.pop("$defs", {})
    parameters: dict[str, Any] = {
        "type": "object",
        "properties": {"content": content_schema},
        "required": ["content"],
        "additionalProperties": False,
    }
    if definitions:
        parameters["$defs"] = definitions
    return parameters


def model_parameters(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    schema.pop("title", None)
    return schema


def save_handler(kind: CreativeKind) -> ToolHandler:
    async def handler(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
        content = cast(dict[str, Any], arguments["content"])
        document = await CreativeDocumentService(context.session).save(
            context.project_id,
            context.user_id,
            kind=kind,
            status="approved",
            content=content,
            source_run_id=context.run_id,
        )
        data = serialize_document(document)
        return ToolExecutionResult(data={"document": data}, artifact=data)

    return handler


async def get_creative_document(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = GetCreativeDocumentArgs.model_validate(arguments)
    document = await CreativeDocumentService(context.session).get_kind(
        context.project_id, context.user_id, values.kind
    )
    return ToolExecutionResult(data={"document": serialize_document(document)})


async def update_creative_status(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = UpdateCreativeStatusArgs.model_validate(arguments)
    document = await CreativeDocumentService(context.session).revise_status(
        context.project_id,
        values.document_id,
        context.user_id,
        status=values.status,
        source_run_id=context.run_id,
    )
    data = serialize_document(document)
    return ToolExecutionResult(data={"document": data}, artifact=data)


def creative_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="get_creative_document",
            description=(
                "Read the latest creative brief, plot, script, or storyboard before "
                "deriving another artifact or editing the timeline."
            ),
            parameters=model_parameters(GetCreativeDocumentArgs),
            handler=get_creative_document,
        ),
        ToolDefinition(
            name="update_creative_status",
            description=(
                "Promote a legacy draft or proposal to the current version. New creative "
                "documents are current immediately and normally do not need this tool."
            ),
            parameters=model_parameters(UpdateCreativeStatusArgs),
            handler=update_creative_status,
        ),
        ToolDefinition(
            name="save_project_brief",
            description=(
                "Save the agreed structured video brief as the current version. Do not call "
                "while merely discussing ideas."
            ),
            parameters=content_parameters(BriefContent),
            handler=save_handler("brief"),
        ),
        ToolDefinition(
            name="save_plot",
            description=(
                "Save the agreed structured plot as the current version. Do not call while the "
                "user is still exploring alternatives."
            ),
            parameters=content_parameters(PlotContent),
            handler=save_handler("plot"),
        ),
        ToolDefinition(
            name="save_script",
            description="Save the agreed narration and caption script as the current version.",
            parameters=content_parameters(ScriptContent),
            handler=save_handler("script"),
        ),
        ToolDefinition(
            name="save_storyboard",
            description="Save the agreed shot-by-shot storyboard as the current version.",
            parameters=content_parameters(StoryboardContent),
            handler=save_handler("storyboard"),
        ),
    )
