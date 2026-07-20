from __future__ import annotations

from typing import Any

from douga.db.unit_of_work import UnitOfWork
from douga.modules.assistant.tools.project_tool_service import (
    ProjectToolService,
    empty_parameters,
    model_parameters,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
)
from douga.modules.video_composition.schemas import (
    NarratedVideoInput,
    RebuildNarrationInput,
)
from douga.modules.video_composition.service import (
    VideoCompositionResult,
    VideoCompositionService,
)


async def compose_narrated_video(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = NarratedVideoInput.model_validate(arguments)
    project_tools = ProjectToolService(context)
    run = await project_tools.run()
    expected_revision = run.result_revision_number or run.base_revision_number
    result = await VideoCompositionService(context.session).compose(
        context.project_id,
        context.user_id,
        expected_revision,
        values,
        run_id=context.run_id,
        emit_progress=context.emit_progress,
    )
    run = await project_tools.run()
    run.result_revision_number = result.detail.project.current_revision_number
    await UnitOfWork(context.session).commit()
    return _composition_result(result)


async def rebuild_narration_master(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = RebuildNarrationInput.model_validate(arguments)
    project_tools = ProjectToolService(context)
    run = await project_tools.run()
    expected_revision = run.result_revision_number or run.base_revision_number
    result = await VideoCompositionService(context.session).rebuild_narration(
        context.project_id,
        context.user_id,
        expected_revision,
        values,
        run_id=context.run_id,
        emit_progress=context.emit_progress,
    )
    run = await project_tools.run()
    run.result_revision_number = result.detail.project.current_revision_number
    await UnitOfWork(context.session).commit()
    return _composition_result(result)


async def validate_narrated_video(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    del arguments
    detail, asset_id, validation = await VideoCompositionService(
        context.session
    ).validate_saved_project(context.project_id, context.user_id)
    return ToolExecutionResult(
        data={
            "revision_number": detail.project.current_revision_number,
            "master_audio_asset_id": str(asset_id),
            "validation": validation.as_dict(),
        }
    )


def _composition_result(result: VideoCompositionResult) -> ToolExecutionResult:
    revision_number = result.detail.project.current_revision_number
    return ToolExecutionResult(
        data={
            "project_id": str(result.detail.project.id),
            "revision_number": revision_number,
            "master_audio_asset_id": str(result.master_audio_asset_id),
            "duration_ms": result.duration_ms,
            "section_count": result.section_count,
            "cue_count": result.cue_count,
            "narration_track_count": 1,
            "validation": result.validation.as_dict(),
        },
        revision_number=revision_number,
    )


def _strict_parameters(
    model: type[NarratedVideoInput] | type[RebuildNarrationInput],
) -> dict[str, Any]:
    schema = model_parameters(model)

    def visit(value: object) -> None:
        if isinstance(value, list):
            for item in value:
                visit(item)
            return
        if not isinstance(value, dict):
            return
        properties = value.get("properties")
        if isinstance(properties, dict):
            value["required"] = list(properties)
        for child in value.values():
            visit(child)

    visit(schema)
    return schema


def narrated_video_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="compose_narrated_video",
            description=(
                "Atomically create or replace an editable narrated-video draft. Provide semantic "
                "sections and caption cues without millisecond timings. The tool synthesizes each "
                "cue, measures exact WAV boundaries, creates one narration master, aligns all "
                "captions and visuals, validates the result, and saves exactly one revision."
            ),
            parameters=_strict_parameters(NarratedVideoInput),
            handler=compose_narrated_video,
            approval_policy=lambda arguments: arguments.get("replace_scope")
            == "entire_timeline",
        ),
        ToolDefinition(
            name="rebuild_narration_master",
            description=(
                "Re-synthesize the complete narration master and realign every generated caption "
                "and, by default, every generated visual boundary. Omit sections to reuse the "
                "semantic section and cue definitions stored with the current master audio."
            ),
            parameters=_strict_parameters(RebuildNarrationInput),
            handler=rebuild_narration_master,
        ),
        ToolDefinition(
            name="validate_narrated_video",
            description=(
                "Validate that the saved draft has exactly one generated narration master and "
                "that its cue metadata, captions, visuals, keyframes, and video duration agree."
            ),
            parameters=empty_parameters(),
            handler=validate_narrated_video,
        ),
    )
