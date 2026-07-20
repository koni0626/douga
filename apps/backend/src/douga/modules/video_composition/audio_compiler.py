from __future__ import annotations

import io
import wave
from dataclasses import dataclass

from douga.core.errors import ApplicationError


@dataclass(frozen=True, slots=True)
class NarrationSegment:
    cue_id: str
    section_id: str
    display_text: str
    resolved_speech_text: str
    wav_content: bytes


@dataclass(frozen=True, slots=True)
class CompiledCue:
    cue_id: str
    section_id: str
    display_text: str
    resolved_speech_text: str
    start_frame: int
    end_frame: int
    start_ms: int
    end_ms: int


@dataclass(frozen=True, slots=True)
class CompiledNarration:
    wav_content: bytes
    cues: tuple[CompiledCue, ...]
    sample_rate: int
    channels: int
    sample_width: int
    frame_count: int
    duration_ms: int


AudioFormat = tuple[int, int, int, str]


class MasterNarrationCompiler:
    def compile(self, segments: tuple[NarrationSegment, ...]) -> CompiledNarration:
        if not segments:
            raise ApplicationError(
                "NARRATED_VIDEO_INPUT_INVALID", "errors.assistantToolArgumentsInvalid", 422
            )
        try:
            audio_format, audio_frames, cues, total_frames = self._parse_segments(segments)
        except ApplicationError:
            raise
        except (EOFError, wave.Error, ValueError) as error:
            raise ApplicationError(
                "NARRATION_COMPILE_FAILED", "errors.speechGenerationFailed", 502
            ) from error
        output = self._write_master(audio_format, audio_frames)
        duration_ms = round(total_frames * 1000 / audio_format[2])
        return CompiledNarration(
            wav_content=output,
            cues=tuple(cues),
            sample_rate=audio_format[2],
            channels=audio_format[0],
            sample_width=audio_format[1],
            frame_count=total_frames,
            duration_ms=duration_ms,
        )

    def _parse_segments(
        self, segments: tuple[NarrationSegment, ...]
    ) -> tuple[AudioFormat, list[bytes], list[CompiledCue], int]:
        expected: AudioFormat | None = None
        frames: list[bytes] = []
        cues: list[CompiledCue] = []
        total_frames = 0
        for segment in segments:
            current, content, cue = self._read_segment(segment, expected, total_frames)
            expected = current
            frames.append(content)
            cues.append(cue)
            total_frames = cue.end_frame
        if expected is None:
            raise _compile_error()
        return expected, frames, cues, total_frames

    @staticmethod
    def _read_segment(
        segment: NarrationSegment,
        expected: AudioFormat | None,
        start_frame: int,
    ) -> tuple[AudioFormat, bytes, CompiledCue]:
        with wave.open(io.BytesIO(segment.wav_content), "rb") as reader:
            current = (
                reader.getnchannels(),
                reader.getsampwidth(),
                reader.getframerate(),
                reader.getcomptype(),
            )
            if current[3] != "NONE" or min(current[:3]) <= 0 or (
                expected is not None and current != expected
            ):
                raise ApplicationError(
                    "NARRATION_FORMAT_MISMATCH", "errors.speechGenerationFailed", 502
                )
            frame_count = reader.getnframes()
            content = reader.readframes(frame_count)
        if frame_count <= 0 or not content:
            raise _compile_error()
        end_frame = start_frame + frame_count
        cue = CompiledCue(
            cue_id=segment.cue_id,
            section_id=segment.section_id,
            display_text=segment.display_text,
            resolved_speech_text=segment.resolved_speech_text,
            start_frame=start_frame,
            end_frame=end_frame,
            start_ms=round(start_frame * 1000 / current[2]),
            end_ms=round(end_frame * 1000 / current[2]),
        )
        return current, content, cue

    @staticmethod
    def _write_master(audio_format: AudioFormat, frames: list[bytes]) -> bytes:
        output = io.BytesIO()
        try:
            with wave.open(output, "wb") as writer:
                writer.setnchannels(audio_format[0])
                writer.setsampwidth(audio_format[1])
                writer.setframerate(audio_format[2])
                writer.setcomptype("NONE", "not compressed")
                for content in frames:
                    writer.writeframesraw(content)
        except wave.Error as error:
            raise _compile_error() from error
        return output.getvalue()


def _compile_error() -> ApplicationError:
    return ApplicationError(
        "NARRATION_COMPILE_FAILED", "errors.speechGenerationFailed", 502
    )
