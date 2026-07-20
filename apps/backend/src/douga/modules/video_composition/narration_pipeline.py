from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from douga.core.config import get_settings
from douga.core.errors import ApplicationError
from douga.integrations.aivis_speech import AivisSpeechClient
from douga.modules.video_composition.audio_compiler import NarrationSegment
from douga.modules.video_composition.pronunciation import apply_pronunciation_dictionary
from douga.modules.video_composition.schemas import NarratedVideoInput

ProgressEmitter = Callable[[dict[str, Any]], Awaitable[None]]


class NarrationSynthesizer:
    def __init__(self, client: AivisSpeechClient | None = None) -> None:
        self.client = client or AivisSpeechClient()

    async def validate(self, request: NarratedVideoInput) -> None:
        try:
            voices = await self.client.list_voices()
        except ApplicationError as error:
            raise ApplicationError(
                "NARRATION_SYNTHESIS_FAILED", "errors.speechGenerationFailed", 502
            ) from error
        style_ids = {style.id for voice in voices for style in voice.styles}
        if request.voice.style_id not in style_ids:
            raise ApplicationError(
                "NARRATION_VOICE_INVALID", "errors.speechGenerationFailed", 422
            )
        maximum = get_settings().aivis_max_text_length
        if any(
            not (cue.speech_text or cue.display_text).strip()
            or len((cue.speech_text or cue.display_text).strip()) > maximum
            for section in request.sections
            for cue in section.cues
        ):
            raise ApplicationError(
                "NARRATED_VIDEO_INPUT_INVALID",
                "errors.assistantToolArgumentsInvalid",
                422,
            )

    async def synthesize(
        self,
        request: NarratedVideoInput,
        *,
        locale: str,
        emit_progress: ProgressEmitter | None,
    ) -> list[NarrationSegment]:
        cues = [
            (section.id, cue)
            for section in request.sections
            for cue in section.cues
        ]
        segments: list[NarrationSegment] = []
        for index, (section_id, cue) in enumerate(cues):
            source_text = cue.speech_text or cue.display_text
            resolved = apply_pronunciation_dictionary(
                source_text, request.pronunciation_entries, locale=locale
            )
            content = await self._synthesize_cue(resolved, request)
            segments.append(
                NarrationSegment(
                    cue_id=cue.id,
                    section_id=section_id,
                    display_text=cue.display_text,
                    resolved_speech_text=resolved,
                    wav_content=content,
                )
            )
            await emit(
                emit_progress,
                "synthesize_narration",
                5 + round(((index + 1) / len(cues)) * 60),
            )
        return segments

    async def _synthesize_cue(
        self, text: str, request: NarratedVideoInput
    ) -> bytes:
        try:
            return await self.client.synthesize(
                text=text,
                style_id=request.voice.style_id,
                speed_scale=request.voice.speed_scale,
                intonation_scale=request.voice.intonation_scale,
                tempo_dynamics_scale=request.voice.tempo_dynamics_scale,
                volume_scale=request.voice.volume_scale,
            )
        except ApplicationError as error:
            raise ApplicationError(
                "NARRATION_SYNTHESIS_FAILED", "errors.speechGenerationFailed", 502
            ) from error


async def emit(
    emitter: ProgressEmitter | None, phase: str, progress: int
) -> None:
    if emitter is not None:
        await emitter({"phase": phase, "progress": progress})
