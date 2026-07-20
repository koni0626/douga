import io
import wave

import pytest
from douga.core.errors import ApplicationError
from douga.modules.video_composition.audio_compiler import (
    MasterNarrationCompiler,
    NarrationSegment,
)


def _wav(frame_count: int, *, frame_rate: int = 1_000, channels: int = 1) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(channels)
        stream.setsampwidth(2)
        stream.setframerate(frame_rate)
        stream.writeframes(b"\0\0" * channels * frame_count)
    return output.getvalue()


def _segment(index: int, content: bytes) -> NarrationSegment:
    return NarrationSegment(
        cue_id=f"cue-{index}",
        section_id=f"section-{index // 3}",
        display_text=f"表示{index}",
        resolved_speech_text=f"読み{index}",
        wav_content=content,
    )


def test_compiles_one_wav_and_exact_cumulative_frame_boundaries() -> None:
    result = MasterNarrationCompiler().compile(
        (_segment(0, _wav(333)), _segment(1, _wav(667)))
    )

    assert result.frame_count == 1_000
    assert result.duration_ms == 1_000
    assert [(cue.start_frame, cue.end_frame) for cue in result.cues] == [
        (0, 333),
        (333, 1_000),
    ]
    assert [(cue.start_ms, cue.end_ms) for cue in result.cues] == [
        (0, 333),
        (333, 1_000),
    ]
    with wave.open(io.BytesIO(result.wav_content), "rb") as stream:
        assert stream.getnframes() == 1_000


def test_compiles_23_cues_without_accumulating_rounded_milliseconds() -> None:
    segments = tuple(_segment(index, _wav(101, frame_rate=44_100)) for index in range(23))

    result = MasterNarrationCompiler().compile(segments)

    assert len(result.cues) == 23
    assert result.frame_count == 2_323
    assert result.cues[-1].end_frame == 2_323
    assert result.cues[-1].end_ms == round(2_323 * 1_000 / 44_100)


def test_rejects_mismatched_wav_formats() -> None:
    with pytest.raises(ApplicationError) as caught:
        MasterNarrationCompiler().compile(
            (_segment(0, _wav(100, channels=1)), _segment(1, _wav(100, channels=2)))
        )

    assert caught.value.code == "NARRATION_FORMAT_MISMATCH"
