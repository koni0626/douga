import io
import wave

import httpx
import pytest
from douga.core.config import Settings
from douga.core.errors import ApplicationError
from douga.integrations.aivis_speech import AivisSpeechClient


class AvailableProcessManager:
    async def ensure_started(self, _: httpx.AsyncClient) -> None:
        return None


def settings() -> Settings:
    return Settings(
        app_env="test",
        app_secret_key="test-secret-key-with-at-least-32-characters",
        aivis_auto_start=False,
        _env_file=None,
    )


def wav_bytes() -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(24_000)
        stream.writeframes(b"\0\0" * 2_400)
    return output.getvalue()


async def test_lists_voices_and_synthesizes_with_aivis_parameters() -> None:
    expected_wav = wav_bytes()
    synthesis_query: dict[str, object] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/speakers":
            return httpx.Response(
                200,
                json=[
                    {
                        "speaker_uuid": "voice-1",
                        "name": "Announcer",
                        "styles": [{"id": 42, "name": "Normal"}],
                    }
                ],
            )
        if request.url.path == "/audio_query":
            assert request.url.params["text"] == "こんにちは"
            assert request.url.params["speaker"] == "42"
            return httpx.Response(200, json={"speedScale": 1.0, "kana": "こんにちは"})
        if request.url.path == "/synthesis":
            synthesis_query.update(__import__("json").loads(request.content))
            return httpx.Response(200, content=expected_wav, headers={"Content-Type": "audio/wav"})
        raise AssertionError(f"unexpected path: {request.url.path}")

    client = AivisSpeechClient(
        settings(),
        transport=httpx.MockTransport(handle),
        process_manager=AvailableProcessManager(),  # type: ignore[arg-type]
    )
    voices = await client.list_voices()
    audio = await client.synthesize(
        text="こんにちは",
        style_id=42,
        speed_scale=1.2,
        intonation_scale=0.8,
        tempo_dynamics_scale=1.3,
        volume_scale=0.9,
    )

    assert voices[0].name == "Announcer"
    assert voices[0].styles[0].id == 42
    assert audio == expected_wav
    assert synthesis_query["speedScale"] == 1.2
    assert synthesis_query["intonationScale"] == 0.8
    assert synthesis_query["tempoDynamicsScale"] == 1.3
    assert synthesis_query["volumeScale"] == 0.9


async def test_maps_aivis_http_failure_to_safe_application_error() -> None:
    def handle(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="internal engine details must not escape")

    client = AivisSpeechClient(
        settings(),
        transport=httpx.MockTransport(handle),
        process_manager=AvailableProcessManager(),  # type: ignore[arg-type]
    )

    with pytest.raises(ApplicationError) as caught:
        await client.list_voices()

    assert caught.value.code == "AIVIS_REQUEST_FAILED"
    assert caught.value.message_key == "errors.speechGenerationFailed"
    assert caught.value.details is None
