from collections.abc import Callable
from copy import deepcopy
from typing import Any, cast

from pydantic import BaseModel, ConfigDict

from douga.core.errors import ApplicationError, ConflictError, NotFoundError
from douga.db.unit_of_work import UnitOfWork
from douga.modules.assistant.models import AssistantRun
from douga.modules.assistant.repository import AssistantRepository
from douga.modules.assistant.tools.registry import ToolContext, ToolExecutionResult
from douga.modules.projects.service import ProjectDetail, ProjectService


class StrictToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


def model_parameters(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    schema.pop("title", None)
    return schema


def empty_parameters() -> dict[str, Any]:
    return {"type": "object", "properties": {}, "required": [], "additionalProperties": False}


def canvas(document: dict[str, Any]) -> dict[str, Any]:
    scenes = cast(list[dict[str, Any]], document.get("scenes", []))
    if not scenes:
        raise ApplicationError("PROJECT_CANVAS_NOT_FOUND", "errors.projectCanvasNotFound", 422)
    return scenes[0]


def validate_time_range(start_ms: int, end_ms: int) -> None:
    if end_ms <= start_ms:
        raise ApplicationError(
            "ASSISTANT_TOOL_ARGUMENTS_INVALID", "errors.assistantToolArgumentsInvalid", 422
        )


def find_layer(document: dict[str, Any], layer_id: str) -> dict[str, Any]:
    for layer in canvas(document)["layers"]:
        if layer["id"] == layer_id:
            return cast(dict[str, Any], layer)
    raise NotFoundError("LAYER_NOT_FOUND", "errors.layerNotFound")


def find_clip(
    document: dict[str, Any], clip_id: str
) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    collections: tuple[tuple[str, list[dict[str, Any]]], ...] = (
        ("layer", canvas(document)["layers"]),
        ("caption", canvas(document)["dialogues"]),
        ("audio", cast(list[dict[str, Any]], document.get("audio_tracks", []))),
        ("camera", cast(list[dict[str, Any]], document.get("camera_effects", []))),
    )
    for kind, items in collections:
        for item in items:
            if item["id"] == clip_id:
                return kind, item, items
    raise NotFoundError("CLIP_NOT_FOUND", "errors.layerNotFound")


class ProjectToolService:
    def __init__(self, context: ToolContext) -> None:
        self.context = context
        self.projects = ProjectService(context.session)
        self.assistant = AssistantRepository(context.session)
        self.uow = UnitOfWork(context.session)

    async def detail(self) -> ProjectDetail:
        return await self.projects.get_project(self.context.project_id, self.context.user_id)

    async def run(self) -> AssistantRun:
        run = await self.assistant.get_run(
            self.context.run_id, self.context.project_id, self.context.user_id
        )
        if run is None:
            raise NotFoundError("ASSISTANT_RUN_NOT_FOUND", "errors.assistantRunNotFound")
        return run

    async def mutate(
        self,
        mutator: Callable[[dict[str, Any]], None],
        change_summary: str,
    ) -> tuple[ProjectDetail, AssistantRun]:
        run = await self.run()
        detail = await self.detail()
        expected_revision = run.result_revision_number or run.base_revision_number
        if detail.project.current_revision_number != expected_revision:
            raise ConflictError("ASSISTANT_PROJECT_CONFLICT", "errors.assistantProjectConflict")
        document = deepcopy(detail.document)
        mutator(document)
        saved = await self.projects.save_revision(
            self.context.project_id,
            self.context.user_id,
            detail.project.lock_version,
            document,
            change_summary,
        )
        run.result_revision_number = saved.project.current_revision_number
        await self.uow.commit()
        return saved, run


def mutation_result(
    detail: ProjectDetail, run: AssistantRun, payload: dict[str, Any]
) -> ToolExecutionResult:
    return ToolExecutionResult(
        data={**payload, "revision_number": detail.project.current_revision_number},
        revision_number=run.result_revision_number,
    )
