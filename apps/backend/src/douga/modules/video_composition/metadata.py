from __future__ import annotations

from typing import Any
from uuid import UUID

from douga.core.errors import ApplicationError
from douga.modules.video_composition.audio_compiler import (
    CompiledCue,
    CompiledNarration,
)
from douga.modules.video_composition.schemas import (
    NarratedSectionInput,
    NarratedVideoInput,
)


def master_audio_metadata(
    request: NarratedVideoInput,
    narration: CompiledNarration,
    run_id: UUID | None,
) -> dict[str, object]:
    return {
        "provider": "aivis_speech",
        "alignment_method": "master_segmented_synthesis_v1",
        "assistant_run_id": str(run_id) if run_id is not None else None,
        "sample_rate": narration.sample_rate,
        "channels": narration.channels,
        "sample_width": narration.sample_width,
        "frame_count": narration.frame_count,
        "duration_ms": narration.duration_ms,
        "voice": request.voice.model_dump(mode="json"),
        "sections": [section.model_dump(mode="json") for section in request.sections],
        "cues": [
            {
                "id": cue.cue_id,
                "section_id": cue.section_id,
                "display_text": cue.display_text,
                "resolved_speech_text": cue.resolved_speech_text,
                "start_frame": cue.start_frame,
                "end_frame": cue.end_frame,
                "start_ms": cue.start_ms,
                "end_ms": cue.end_ms,
            }
            for cue in narration.cues
        ],
    }


def sections_from_metadata(metadata: dict[str, Any]) -> list[NarratedSectionInput]:
    _validate_alignment_method(metadata)
    try:
        sections = [
            NarratedSectionInput.model_validate(value)
            for value in metadata["sections"]
        ]
    except (KeyError, TypeError, ValueError) as error:
        raise _metadata_error() from error
    if not sections:
        raise _metadata_error()
    return sections


def narration_from_metadata(metadata: dict[str, Any]) -> CompiledNarration:
    _validate_alignment_method(metadata)
    try:
        cues = tuple(
            CompiledCue(
                cue_id=str(value["id"]),
                section_id=str(value["section_id"]),
                display_text=str(value["display_text"]),
                resolved_speech_text=str(value["resolved_speech_text"]),
                start_frame=int(value["start_frame"]),
                end_frame=int(value["end_frame"]),
                start_ms=int(value["start_ms"]),
                end_ms=int(value["end_ms"]),
            )
            for value in metadata["cues"]
        )
        return CompiledNarration(
            wav_content=b"",
            cues=cues,
            sample_rate=int(metadata["sample_rate"]),
            channels=int(metadata["channels"]),
            sample_width=int(metadata["sample_width"]),
            frame_count=int(metadata["frame_count"]),
            duration_ms=int(metadata["duration_ms"]),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise _metadata_error() from error


def _validate_alignment_method(metadata: dict[str, Any]) -> None:
    if metadata.get("alignment_method") != "master_segmented_synthesis_v1":
        raise _metadata_error()


def _metadata_error() -> ApplicationError:
    return ApplicationError(
        "NARRATED_VIDEO_VALIDATION_FAILED",
        "errors.assistantToolArgumentsInvalid",
        422,
    )
