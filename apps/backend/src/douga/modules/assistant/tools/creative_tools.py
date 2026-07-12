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
    status: Literal["draft", "proposed"]


def serialize_document(document: CreativeDocument) -> dict[str, Any]:
    return {
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
            status="proposed",
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
                "Read the latest approved creative brief, plot, script, or storyboard before "
                "deriving another artifact or editing the timeline."
            ),
            parameters=model_parameters(GetCreativeDocumentArgs),
            handler=get_creative_document,
        ),
        ToolDefinition(
            name="update_creative_status",
            description=(
                "Create a new draft or proposed version with a changed status. Approval is a "
                "user-only UI action and cannot be performed by this tool."
            ),
            parameters=model_parameters(UpdateCreativeStatusArgs),
            handler=update_creative_status,
        ),
        ToolDefinition(
            name="save_project_brief",
            description=(
                "Save a structured video brief only when the user explicitly asks to create or "
                "save the agreed brief. Do not call while merely discussing ideas."
            ),
            parameters=content_parameters(BriefContent),
            handler=save_handler("brief"),
        ),
        ToolDefinition(
            name="save_plot",
            description=(
                "Save a structured plot proposal only when the user explicitly asks to create or "
                "save it. Do not call while the user is still exploring alternatives."
            ),
            parameters=content_parameters(PlotContent),
            handler=save_handler("plot"),
        ),
        ToolDefinition(
            name="save_script",
            description="Save an agreed structured narration and caption script as a proposal.",
            parameters=content_parameters(ScriptContent),
            handler=save_handler("script"),
        ),
        ToolDefinition(
            name="save_storyboard",
            description="Save an agreed structured shot-by-shot storyboard as a proposal.",
            parameters=content_parameters(StoryboardContent),
            handler=save_handler("storyboard"),
        ),
    )
