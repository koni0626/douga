from typing import Any, cast

from pydantic import BaseModel

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


def creative_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="save_brief",
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
