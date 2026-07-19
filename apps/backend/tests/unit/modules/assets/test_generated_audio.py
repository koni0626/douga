import io
import wave

import pytest
from douga.core.errors import ApplicationError
from douga.modules.assets.service import AssetService


def wav_bytes(*, frames: int = 2_400, sample_rate: int = 24_000) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(b"\0\0" * frames)
    return output.getvalue()


def test_generated_wav_duration_is_calculated_without_ffprobe() -> None:
    assert AssetService._inspect_wav(wav_bytes()) == 100


def test_generated_audio_rejects_non_wav_response() -> None:
    with pytest.raises(ApplicationError) as caught:
        AssetService._inspect_wav(b"not a wav")
    assert caught.value.code == "GENERATED_AUDIO_INVALID"
