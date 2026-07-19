import re
from dataclasses import dataclass
from typing import Any, Literal, cast
from uuid import UUID, uuid4

from pydantic import Field

from douga.core.errors import ApplicationError, NotFoundError
from douga.modules.assets.models import Asset
from douga.modules.assets.repository import AssetRepository
from douga.modules.assistant.tools.project_tool_service import (
    ProjectToolService,
    StrictToolArgs,
    canvas,
    find_clip,
    model_parameters,
    mutation_result,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
)
from douga.modules.speech.schemas import SpeechSynthesisRequest
from douga.modules.speech.service import SpeechCue, SpeechService


class CreateSyncedCaptionsArgs(StrictToolArgs):
    audio_clip_ids: list[str] = Field(min_length=1, max_length=20)
    max_chars_per_caption: int = Field(ge=8, le=120)
    display_effect: Literal["instant", "fade", "typewriter"]
    replace_overlapping_captions: bool


class ValidateNarrationCaptionSyncArgs(StrictToolArgs):
    audio_clip_ids: list[str] = Field(max_length=20)
    tolerance_ms: int = Field(ge=0, le=2_000)


@dataclass(frozen=True, slots=True)
class NarrationSource:
    clip_id: str
    start_ms: int
    old_duration_ms: int
    asset: Asset
    request: SpeechSynthesisRequest


@dataclass(frozen=True, slots=True)
class PreparedNarration:
    source: NarrationSource
    asset_id: UUID
    duration_ms: int
    cues: tuple[SpeechCue, ...]


def _text_key(value: object) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def _clip_range(item: dict[str, Any]) -> tuple[int, int]:
    start_ms = int(item.get("start_ms", 0))
    return start_ms, start_ms + int(item.get("duration_ms", 0))


def _overlaps(item: dict[str, Any], start_ms: int, end_ms: int) -> bool:
    item_start, item_end = _clip_range(item)
    return item_start < end_ms and item_end > start_ms


def _speech_request(asset: Asset) -> SpeechSynthesisRequest:
    metadata = asset.asset_metadata or {}
    if metadata.get("provider") != "aivis_speech":
        raise ApplicationError(
            "NARRATION_ALIGNMENT_UNAVAILABLE",
            "errors.assistantToolArgumentsInvalid",
            422,
        )
    try:
        return SpeechSynthesisRequest.model_validate(
            {
                "text": metadata["text"],
                "style_id": metadata["style_id"],
                "name": f"{asset.name}（字幕同期）"[:255],
                "speed_scale": metadata["speed_scale"],
                "intonation_scale": metadata["intonation_scale"],
                "tempo_dynamics_scale": metadata["tempo_dynamics_scale"],
                "volume_scale": metadata["volume_scale"],
            }
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ApplicationError(
            "NARRATION_ALIGNMENT_UNAVAILABLE",
            "errors.assistantToolArgumentsInvalid",
            422,
        ) from error


async def _narration_sources(
    context: ToolContext, audio_clip_ids: list[str]
) -> tuple[NarrationSource, ...]:
    detail = await ProjectToolService(context).detail()
    document = detail.document
    repository = AssetRepository(context.session)
    sources: list[NarrationSource] = []
    for clip_id in audio_clip_ids:
        kind, clip, _ = find_clip(document, clip_id)
        if kind != "audio" or clip.get("role") != "narration":
            raise ApplicationError(
                "NARRATION_CLIP_REQUIRED", "errors.assistantToolArgumentsInvalid", 422
            )
        try:
            asset_id = UUID(str(clip["asset_id"]))
        except (KeyError, ValueError, TypeError) as error:
            raise NotFoundError("ASSET_NOT_FOUND", "errors.assetNotFound") from error
        asset = await repository.get_owned(asset_id, context.user_id)
        if asset is None or asset.status != "ready" or asset.kind != "audio":
            raise NotFoundError("ASSET_NOT_FOUND", "errors.assetNotFound")
        sources.append(
            NarrationSource(
                clip_id=clip_id,
                start_ms=int(clip.get("start_ms", 0)),
                old_duration_ms=int(clip.get("duration_ms") or asset.duration_ms or 0),
                asset=asset,
                request=_speech_request(asset),
            )
        )
    return tuple(sources)


async def create_synced_captions_from_narration(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = CreateSyncedCaptionsArgs.model_validate(arguments)
    if len(set(values.audio_clip_ids)) != len(values.audio_clip_ids):
        raise ApplicationError(
            "ASSISTANT_TOOL_ARGUMENTS_INVALID",
            "errors.assistantToolArgumentsInvalid",
            422,
        )
    sources = await _narration_sources(context, values.audio_clip_ids)
    prepared: list[PreparedNarration] = []
    for index, source in enumerate(sources):
        result = await SpeechService(context.session).synthesize_synced(
            context.user_id,
            source.request,
            max_chars_per_caption=values.max_chars_per_caption,
        )
        if result.asset.duration_ms is None:
            raise ApplicationError(
                "AIVIS_INVALID_RESPONSE", "errors.speechGenerationFailed", 502
            )
        prepared.append(
            PreparedNarration(
                source=source,
                asset_id=result.asset.id,
                duration_ms=result.asset.duration_ms,
                cues=result.cues,
            )
        )
        if context.emit_progress is not None:
            await context.emit_progress(
                {
                    "phase": "narration_caption_sync",
                    "progress": round(((index + 1) / len(sources)) * 100),
                }
            )

    caption_ids: list[str] = []

    def mutate(document: dict[str, Any]) -> None:
        dialogues = cast(list[dict[str, Any]], canvas(document)["dialogues"])
        replacement_ranges = [
            (
                item.source.start_ms,
                item.source.start_ms
                + max(item.source.old_duration_ms, item.duration_ms),
            )
            for item in prepared
        ]
        if values.replace_overlapping_captions:
            dialogues[:] = [
                dialogue
                for dialogue in dialogues
                if not any(_overlaps(dialogue, start, end) for start, end in replacement_ranges)
            ]

        for item in prepared:
            kind, audio_clip, _ = find_clip(document, item.source.clip_id)
            if kind != "audio" or audio_clip.get("role") != "narration":
                raise ApplicationError(
                    "NARRATION_CLIP_REQUIRED",
                    "errors.assistantToolArgumentsInvalid",
                    422,
                )
            audio_clip["asset_id"] = str(item.asset_id)
            audio_clip["duration_ms"] = item.duration_ms
            audio_clip["trim_start_ms"] = 0
            audio_clip["speech_synthesis"] = {
                "provider": "aivis_speech",
                **item.source.request.model_dump(
                    mode="json",
                    exclude={"name"},
                ),
            }
            first_caption_id: str | None = None
            for cue in item.cues:
                caption_id = str(uuid4())
                if first_caption_id is None:
                    first_caption_id = caption_id
                caption_ids.append(caption_id)
                dialogues.append(
                    {
                        "id": caption_id,
                        "speaker": None,
                        "start_ms": item.source.start_ms + cue.start_ms,
                        "text": cue.text,
                        "display_effect": values.display_effect,
                        "duration_mode": "narration",
                        "duration_ms": cue.end_ms - cue.start_ms,
                        "manual_page_breaks": [],
                    }
                )
            audio_clip["dialogue_id"] = first_caption_id
            document["video"]["duration_ms"] = max(
                int(document["video"].get("duration_ms", 5_000)),
                item.source.start_ms + item.duration_ms,
            )

    detail, run = await ProjectToolService(context).mutate(
        mutate, "AI: synchronize narration and captions"
    )
    return mutation_result(
        detail,
        run,
        {
            "audio_clips": [
                {
                    "clip_id": item.source.clip_id,
                    "asset_id": str(item.asset_id),
                    "duration_ms": item.duration_ms,
                    "caption_count": len(item.cues),
                }
                for item in prepared
            ],
            "caption_ids": caption_ids,
            "alignment_method": "segmented_synthesis_v1",
        },
    )


def _alignment_cues(asset: Asset) -> list[dict[str, Any]] | None:
    metadata = asset.asset_metadata or {}
    if metadata.get("alignment_method") != "segmented_synthesis_v1":
        return None
    cues = metadata.get("caption_cues")
    if not isinstance(cues, list):
        return None
    result: list[dict[str, Any]] = []
    for cue in cues:
        if (
            not isinstance(cue, dict)
            or not isinstance(cue.get("text"), str)
            or not isinstance(cue.get("start_ms"), int)
            or not isinstance(cue.get("end_ms"), int)
        ):
            return None
        result.append(cue)
    return result


async def validate_narration_caption_sync(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = ValidateNarrationCaptionSyncArgs.model_validate(arguments)
    detail = await ProjectToolService(context).detail()
    document = detail.document
    scene = canvas(document)
    narration_clips = [
        item
        for item in document.get("audio_tracks", [])
        if item.get("role") == "narration"
        and (not values.audio_clip_ids or item.get("id") in values.audio_clip_ids)
    ]
    if values.audio_clip_ids and len(narration_clips) != len(set(values.audio_clip_ids)):
        raise ApplicationError(
            "NARRATION_CLIP_REQUIRED", "errors.assistantToolArgumentsInvalid", 422
        )

    repository = AssetRepository(context.session)
    issues: list[dict[str, Any]] = []
    verified_caption_count = 0
    for clip in narration_clips:
        clip_id = str(clip["id"])
        try:
            asset_id = UUID(str(clip["asset_id"]))
        except (KeyError, ValueError, TypeError):
            issues.append({"code": "invalid_asset_id", "clip_id": clip_id})
            continue
        asset = await repository.get_owned(asset_id, context.user_id)
        if asset is None:
            issues.append({"code": "missing_asset", "clip_id": clip_id})
            continue
        cues = _alignment_cues(asset)
        if cues is None:
            issues.append({"code": "alignment_metadata_missing", "clip_id": clip_id})
            continue

        clip_start = int(clip.get("start_ms", 0))
        clip_end = clip_start + int(clip.get("duration_ms") or asset.duration_ms or 0)
        captions = sorted(
            (
                item
                for item in scene["dialogues"]
                if _overlaps(item, clip_start, clip_end)
            ),
            key=lambda item: int(item.get("start_ms", 0)),
        )
        if len(captions) != len(cues):
            issues.append(
                {
                    "code": "caption_count_mismatch",
                    "clip_id": clip_id,
                    "expected": len(cues),
                    "actual": len(captions),
                }
            )
        for index, cue in enumerate(cues):
            if index >= len(captions):
                break
            caption = captions[index]
            expected_start = clip_start + int(cue["start_ms"])
            expected_end = clip_start + int(cue["end_ms"])
            actual_start, actual_end = _clip_range(caption)
            text_matches = _text_key(caption.get("text")) == _text_key(cue["text"])
            if not text_matches:
                issues.append(
                    {
                        "code": "caption_text_mismatch",
                        "clip_id": clip_id,
                        "caption_id": caption.get("id"),
                        "index": index,
                    }
                )
            timing_matches = not (
                abs(actual_start - expected_start) > values.tolerance_ms
                or abs(actual_end - expected_end) > values.tolerance_ms
            )
            if not timing_matches:
                issues.append(
                    {
                        "code": "caption_timing_mismatch",
                        "clip_id": clip_id,
                        "caption_id": caption.get("id"),
                        "index": index,
                        "expected_start_ms": expected_start,
                        "expected_end_ms": expected_end,
                        "actual_start_ms": actual_start,
                        "actual_end_ms": actual_end,
                    }
                )
            if text_matches and timing_matches:
                verified_caption_count += 1

    if not narration_clips:
        issues.append({"code": "narration_clip_missing", "clip_id": None})
    return ToolExecutionResult(
        data={
            "valid": not issues,
            "alignment_method": "segmented_synthesis_v1",
            "narration_clip_count": len(narration_clips),
            "verified_caption_count": verified_caption_count,
            "issues": issues,
        }
    )


def speech_alignment_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="create_synced_captions_from_narration",
            description=(
                "Re-synthesize selected AivisSpeech narration clips in readable caption-sized "
                "segments, concatenate them into replacement audio, and create captions using "
                "the exact measured duration of each synthesized segment. Use this instead of "
                "guessing caption timing from text length."
            ),
            parameters=model_parameters(CreateSyncedCaptionsArgs),
            handler=create_synced_captions_from_narration,
        ),
        ToolDefinition(
            name="validate_narration_caption_sync",
            description=(
                "Verify caption text and start/end timing against exact segmented-synthesis "
                "metadata for selected narration clips, or every narration clip when the ID "
                "list is empty. A timeline or frame validation does not replace this check."
            ),
            parameters=model_parameters(ValidateNarrationCaptionSyncArgs),
            handler=validate_narration_caption_sync,
        ),
    )
