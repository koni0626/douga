from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.errors import ApplicationError, ConflictError
from douga.integrations.aivis_speech import AivisSpeechClient
from douga.modules.assets.service import AssetService
from douga.modules.projects.service import ProjectDetail, ProjectService
from douga.modules.video_composition.artifact_preparer import (
    CompositionArtifactPreparer,
    PreparedComposition,
)
from douga.modules.video_composition.audio_compiler import (
    CompiledNarration,
    MasterNarrationCompiler,
)
from douga.modules.video_composition.common import GENERATED_PREFIX
from douga.modules.video_composition.document_builder import NarratedVideoDocumentBuilder
from douga.modules.video_composition.metadata import narration_from_metadata, sections_from_metadata
from douga.modules.video_composition.narration_pipeline import (
    NarrationSynthesizer,
    ProgressEmitter,
    emit,
)
from douga.modules.video_composition.schemas import (
    NarratedSectionInput,
    NarratedVideoInput,
    RebuildNarrationInput,
)
from douga.modules.video_composition.validator import (
    NarratedVideoValidation,
    NarratedVideoValidator,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class VideoCompositionResult:
    detail: ProjectDetail
    master_audio_asset_id: UUID
    duration_ms: int
    section_count: int
    cue_count: int
    validation: NarratedVideoValidation


@dataclass(frozen=True, slots=True)
class _CompositionCommand:
    detail: ProjectDetail
    project_id: UUID
    user_id: UUID
    expected_revision_number: int
    request: NarratedVideoInput
    run_id: UUID | None
    ripple_visuals: bool
    change_summary: str
    emit_progress: ProgressEmitter | None


class VideoCompositionService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        speech_client: AivisSpeechClient | None = None,
        asset_service: AssetService | None = None,
        project_service: ProjectService | None = None,
        compiler: MasterNarrationCompiler | None = None,
        builder: NarratedVideoDocumentBuilder | None = None,
        validator: NarratedVideoValidator | None = None,
    ) -> None:
        self.synthesizer = NarrationSynthesizer(speech_client)
        self.assets = asset_service or AssetService(session)
        self.projects = project_service or ProjectService(session)
        self.compiler = compiler or MasterNarrationCompiler()
        self.builder = builder or NarratedVideoDocumentBuilder()
        self.validator = validator or NarratedVideoValidator()
        self.preparer = CompositionArtifactPreparer(
            self.assets, self.builder, self.validator
        )

    async def compose(
        self,
        project_id: UUID,
        user_id: UUID,
        expected_revision_number: int,
        request: NarratedVideoInput,
        *,
        run_id: UUID | None = None,
        emit_progress: ProgressEmitter | None = None,
    ) -> VideoCompositionResult:
        detail = await self._preflight(
            project_id, user_id, expected_revision_number, request, emit_progress
        )
        return await self._compose_from_detail(
            _CompositionCommand(
                detail,
                project_id,
                user_id,
                expected_revision_number,
                request,
                run_id,
                True,
                "AI: compose narrated video",
                emit_progress,
            )
        )

    async def rebuild_narration(
        self,
        project_id: UUID,
        user_id: UUID,
        expected_revision_number: int,
        request: RebuildNarrationInput,
        *,
        run_id: UUID | None = None,
        emit_progress: ProgressEmitter | None = None,
    ) -> VideoCompositionResult:
        detail = await self.projects.get_project(project_id, user_id)
        _assert_revision(detail, expected_revision_number)
        sections = request.sections or await _sections_from_current_master(
            self.assets, detail, user_id
        )
        compose_request = NarratedVideoInput(
            replace_scope="generated_draft",
            voice=request.voice,
            sections=sections,
            pronunciation_entries=request.pronunciation_entries,
        )
        await self._validate_inputs(user_id, compose_request, emit_progress)
        return await self._compose_from_detail(
            _CompositionCommand(
                detail,
                project_id,
                user_id,
                expected_revision_number,
                compose_request,
                run_id,
                request.ripple_visuals,
                "AI: rebuild narration master",
                emit_progress,
            )
        )

    async def validate_saved_project(
        self, project_id: UUID, user_id: UUID
    ) -> tuple[ProjectDetail, UUID, NarratedVideoValidation]:
        detail = await self.projects.get_project(project_id, user_id)
        track = _master_track(detail.document)
        asset_id = UUID(str(track["asset_id"]))
        asset = await self.assets.get_asset(asset_id, user_id)
        if asset.kind != "audio" or asset.status != "ready":
            raise ApplicationError("ASSET_NOT_FOUND", "errors.assetNotFound", 404)
        metadata = await self.assets.get_asset_metadata(asset_id, user_id)
        narration = narration_from_metadata(metadata)
        sections = sections_from_metadata(metadata)
        validation = self.validator.validate(
            detail.document,
            sections=sections,
            narration=narration,
            master_audio_asset_id=asset_id,
            validate_visuals=True,
        )
        return detail, asset_id, validation

    async def _preflight(
        self,
        project_id: UUID,
        user_id: UUID,
        expected_revision_number: int,
        request: NarratedVideoInput,
        emit_progress: ProgressEmitter | None,
    ) -> ProjectDetail:
        detail = await self.projects.get_project(project_id, user_id)
        _assert_revision(detail, expected_revision_number)
        if request.replace_scope == "empty_only" and _timeline_has_content(detail.document):
            raise ApplicationError(
                "NARRATED_VIDEO_INPUT_INVALID",
                "errors.assistantToolArgumentsInvalid",
                422,
            )
        await self._validate_inputs(user_id, request, emit_progress)
        return detail

    async def _validate_inputs(
        self,
        user_id: UUID,
        request: NarratedVideoInput,
        emit_progress: ProgressEmitter | None,
    ) -> None:
        await emit(emit_progress, "validate_input", 1)
        await self.synthesizer.validate(request)
        for section in request.sections:
            if section.image_asset_id is not None:
                await self.assets.assert_ready_kind(
                    section.image_asset_id, user_id, "image"
                )
        await emit(emit_progress, "validate_input", 5)

    async def _compose_from_detail(
        self, command: _CompositionCommand
    ) -> VideoCompositionResult:
        prepared, narration = await _prepare_artifacts(
            self.synthesizer,
            self.compiler,
            self.preparer,
            command.detail,
            command.user_id,
            command.request,
            command.run_id,
            command.ripple_visuals,
            command.emit_progress,
        )
        try:
            saved = await _save_prepared(
                self.projects,
                command.project_id,
                command.user_id,
                command.expected_revision_number,
                prepared,
                command.change_summary,
                command.emit_progress,
            )
        except ConflictError as error:
            await _discard_if_needed(
                self.assets, prepared.master_audio_asset_id, command.user_id
            )
            if error.code in {"PROJECT_CONFLICT", "ASSISTANT_PROJECT_CONFLICT"}:
                raise ConflictError(
                    "ASSISTANT_PROJECT_CONFLICT", "errors.assistantProjectConflict"
                ) from error
            raise
        except Exception:
            await _discard_if_needed(
                self.assets, prepared.master_audio_asset_id, command.user_id
            )
            raise
        await _emit_after_commit(command.emit_progress)
        return VideoCompositionResult(
            detail=saved,
            master_audio_asset_id=prepared.master_audio_asset_id,
            duration_ms=narration.duration_ms,
            section_count=len(command.request.sections),
            cue_count=len(narration.cues),
            validation=prepared.validation,
        )


async def _prepare_artifacts(
    synthesizer: NarrationSynthesizer,
    compiler: MasterNarrationCompiler,
    preparer: CompositionArtifactPreparer,
    detail: ProjectDetail,
    user_id: UUID,
    request: NarratedVideoInput,
    run_id: UUID | None,
    ripple_visuals: bool,
    emit_progress: ProgressEmitter | None,
) -> tuple[PreparedComposition, CompiledNarration]:
    segments = await synthesizer.synthesize(
        request,
        locale=detail.project.content_locale,
        emit_progress=emit_progress,
    )
    await emit(emit_progress, "compile_master_audio", 65)
    narration = compiler.compile(tuple(segments))
    await emit(emit_progress, "compile_master_audio", 75)
    prepared = await preparer.prepare(
        detail,
        user_id,
        request,
        narration,
        run_id=run_id,
        ripple_visuals=ripple_visuals,
        emit_progress=emit_progress,
    )
    return prepared, narration

async def _save_prepared(
    projects: ProjectService,
    project_id: UUID,
    user_id: UUID,
    expected_revision_number: int,
    prepared: PreparedComposition,
    change_summary: str,
    emit_progress: ProgressEmitter | None,
) -> ProjectDetail:
    current = await projects.get_project(project_id, user_id)
    _assert_revision(current, expected_revision_number)
    await emit(emit_progress, "save_revision", 96)
    await emit(emit_progress, "save_revision", 99)
    saved = await projects.save_revision(
        project_id,
        user_id,
        current.project.lock_version,
        prepared.document,
        change_summary,
    )
    return saved


async def _sections_from_current_master(
    assets: AssetService, detail: ProjectDetail, user_id: UUID
) -> list[NarratedSectionInput]:
    track = _master_track(detail.document)
    metadata = await assets.get_asset_metadata(UUID(str(track["asset_id"])), user_id)
    return sections_from_metadata(metadata)


def _master_track(document: dict[str, Any]) -> dict[str, Any]:
    tracks = [
        track
        for track in document.get("audio_tracks", [])
        if str(track.get("id", "")).startswith(f"{GENERATED_PREFIX}master-audio")
    ]
    if len(tracks) != 1:
        raise ApplicationError(
            "NARRATED_VIDEO_VALIDATION_FAILED",
            "errors.assistantToolArgumentsInvalid",
            422,
        )
    return cast(dict[str, Any], tracks[0])


def _assert_revision(detail: ProjectDetail, expected_revision_number: int) -> None:
    if detail.project.current_revision_number != expected_revision_number:
        raise ConflictError(
            "ASSISTANT_PROJECT_CONFLICT", "errors.assistantProjectConflict"
        )


async def _discard_if_needed(
    assets: AssetService, asset_id: UUID | None, user_id: UUID
) -> None:
    if asset_id is None:
        return
    try:
        await assets.discard_generated_asset(asset_id, user_id)
    except Exception:
        logger.exception(
            "failed to discard temporary narration asset",
            extra={"asset_id": str(asset_id)},
        )


async def _emit_after_commit(emitter: ProgressEmitter | None) -> None:
    try:
        await emit(emitter, "completed", 100)
    except Exception:
        logger.exception("failed to emit completed composition progress after commit")


def _timeline_has_content(document: dict[str, Any]) -> bool:
    return bool(
        any(
            scene.get("layers") or scene.get("dialogues")
            for scene in document.get("scenes", [])
        )
        or document.get("audio_tracks")
        or document.get("camera_effects")
    )
