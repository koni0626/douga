from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from douga.core.errors import ApplicationError
from douga.modules.assets.service import AssetService
from douga.modules.projects.service import ProjectDetail
from douga.modules.video_composition.audio_compiler import CompiledNarration
from douga.modules.video_composition.document_builder import NarratedVideoDocumentBuilder
from douga.modules.video_composition.metadata import master_audio_metadata
from douga.modules.video_composition.narration_pipeline import ProgressEmitter, emit
from douga.modules.video_composition.schemas import NarratedSectionInput, NarratedVideoInput
from douga.modules.video_composition.validator import (
    NarratedVideoValidation,
    NarratedVideoValidator,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class PreparedComposition:
    master_audio_asset_id: UUID
    document: dict[str, Any]
    validation: NarratedVideoValidation


class CompositionArtifactPreparer:
    def __init__(
        self,
        assets: AssetService,
        builder: NarratedVideoDocumentBuilder,
        validator: NarratedVideoValidator,
    ) -> None:
        self.assets = assets
        self.builder = builder
        self.validator = validator

    async def prepare(
        self,
        detail: ProjectDetail,
        user_id: UUID,
        request: NarratedVideoInput,
        narration: CompiledNarration,
        *,
        run_id: UUID | None,
        ripple_visuals: bool,
        emit_progress: ProgressEmitter | None,
    ) -> PreparedComposition:
        asset = await self.assets.create_generated_audio(
            user_id,
            name=f"{detail.project.name} narration master",
            content=narration.wav_content,
            metadata=master_audio_metadata(request, narration, run_id),
        )
        try:
            return await self._build_and_validate(
                detail,
                user_id,
                request,
                narration,
                asset.id,
                asset.duration_ms,
                ripple_visuals,
                emit_progress,
            )
        except Exception:
            try:
                await self.assets.discard_generated_asset(asset.id, user_id)
            except Exception:
                logger.exception(
                    "failed to discard invalid narration asset",
                    extra={"asset_id": str(asset.id)},
                )
            raise

    async def _build_and_validate(
        self,
        detail: ProjectDetail,
        user_id: UUID,
        request: NarratedVideoInput,
        narration: CompiledNarration,
        asset_id: UUID,
        asset_duration_ms: int | None,
        ripple_visuals: bool,
        emit_progress: ProgressEmitter | None,
    ) -> PreparedComposition:
        if asset_duration_ms != narration.duration_ms:
            raise ApplicationError(
                "NARRATED_VIDEO_VALIDATION_FAILED",
                "errors.projectDocumentInvalid",
                422,
            )
        await emit(emit_progress, "build_document", 76)
        document = self.builder.build(
            detail.document,
            sections=request.sections,
            narration=narration,
            master_audio_asset_id=asset_id,
            image_dimensions=await self._image_dimensions(request.sections, user_id),
            replace_scope=request.replace_scope,
            ripple_visuals=ripple_visuals,
        )
        await emit(emit_progress, "build_document", 85)
        validation = self.validator.validate(
            document,
            sections=request.sections,
            narration=narration,
            master_audio_asset_id=asset_id,
            validate_visuals=ripple_visuals,
        )
        await emit(emit_progress, "validate_document", 95)
        if not validation.valid:
            raise ApplicationError(
                "NARRATED_VIDEO_VALIDATION_FAILED",
                "errors.projectDocumentInvalid",
                422,
                details=validation.as_dict(),
            )
        return PreparedComposition(asset_id, document, validation)

    async def _image_dimensions(
        self, sections: list[NarratedSectionInput], user_id: UUID
    ) -> dict[UUID, tuple[int, int]]:
        result: dict[UUID, tuple[int, int]] = {}
        for asset_id in {
            section.image_asset_id
            for section in sections
            if section.image_asset_id is not None
        }:
            asset = await self.assets.get_asset(asset_id, user_id)
            if (
                asset.kind != "image"
                or asset.status != "ready"
                or asset.width is None
                or asset.height is None
            ):
                raise ApplicationError("ASSET_NOT_FOUND", "errors.assetNotFound", 404)
            result[asset_id] = (asset.width, asset.height)
        return result
