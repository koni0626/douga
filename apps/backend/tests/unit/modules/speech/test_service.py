import io
import wave
from typing import cast
from uuid import UUID, uuid4

import pytest
from douga.core.errors import ApplicationError
from douga.modules.assets.service import AssetService, AssetView
from douga.modules.speech.schemas import SpeechSynthesisRequest
from douga.modules.speech.service import SpeechService, split_caption_text
from sqlalchemy.ext.asyncio import AsyncSession


class FakeAivisClient:
    def __init__(self) -> None:
        self.arguments: dict[str, object] | None = None

    async def synthesize(self, **arguments: object) -> bytes:
        self.arguments = arguments
        return b"generated wav"


class FakeSyncedAivisClient(FakeAivisClient):
    async def synthesize(self, **arguments: object) -> bytes:
        self.arguments = arguments
        text = str(arguments["text"])
        output = io.BytesIO()
        with wave.open(output, "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(1_000)
            stream.writeframes(b"\0\0" * (len(text) * 100))
        return output.getvalue()


class FakeAssetService:
    def __init__(self) -> None:
        self.arguments: dict[str, object] | None = None

    async def create_generated_audio(self, user_id: UUID, **arguments: object) -> AssetView:
        self.arguments = {"user_id": user_id, **arguments}
        return AssetView(
            id=uuid4(),
            kind="audio",
            source="generated",
            status="ready",
            name="test",
            original_filename="test.wav",
            mime_type="audio/wav",
            size_bytes=100,
            width=None,
            height=None,
            duration_ms=1000,
            tags=[],
        )


async def test_synthesizes_trimmed_text_and_registers_generated_asset() -> None:
    client = FakeAivisClient()
    assets = FakeAssetService()
    service = SpeechService(
        cast(AsyncSession, object()),
        client=client,  # type: ignore[arg-type]
        asset_service=cast(AssetService, assets),
    )
    user_id = uuid4()

    result = await service.synthesize(
        user_id,
        SpeechSynthesisRequest(text="  こんにちは  ", style_id=42, speed_scale=1.2),
    )

    assert result.kind == "audio"
    assert client.arguments == {
        "text": "こんにちは",
        "style_id": 42,
        "speed_scale": 1.2,
        "intonation_scale": 1.0,
        "tempo_dynamics_scale": 1.0,
        "volume_scale": 1.0,
    }
    assert assets.arguments is not None
    assert assets.arguments["user_id"] == user_id
    assert assets.arguments["metadata"] == {
        "provider": "aivis_speech",
        "text": client.arguments["text"],
        "style_id": 42,
        "speed_scale": 1.2,
        "intonation_scale": 1.0,
        "tempo_dynamics_scale": 1.0,
        "volume_scale": 1.0,
    }
    assert assets.arguments["name"] == "こんにちは"


async def test_rejects_text_longer_than_configured_limit_before_calling_engine() -> None:
    client = FakeAivisClient()
    service = SpeechService(
        cast(AsyncSession, object()),
        client=client,  # type: ignore[arg-type]
        asset_service=cast(AssetService, FakeAssetService()),
    )

    with pytest.raises(ApplicationError) as caught:
        await service.synthesize(uuid4(), SpeechSynthesisRequest(text="あ" * 501, style_id=42))

    assert caught.value.code == "SPEECH_TEXT_INVALID"
    assert client.arguments is None


def test_splits_caption_text_at_sentences_and_readable_punctuation() -> None:
    assert split_caption_text("最初の文です。次の、とても長い文章です。", 10) == (
        "最初の文です。",
        "次の、",
        "とても長い文章です。",
    )


async def test_synthesizes_each_caption_and_stores_exact_wav_cues() -> None:
    client = FakeSyncedAivisClient()
    assets = FakeAssetService()
    service = SpeechService(
        cast(AsyncSession, object()),
        client=client,  # type: ignore[arg-type]
        asset_service=cast(AssetService, assets),
    )

    result = await service.synthesize_synced(
        uuid4(),
        SpeechSynthesisRequest(text="最初です。次です。", style_id=42, name="同期音声"),
        max_chars_per_caption=10,
    )

    assert [cue.text for cue in result.cues] == ["最初です。", "次です。"]
    assert result.cues[0].start_ms == 0
    assert result.cues[0].end_ms == 500
    assert result.cues[1].start_ms == 500
    assert result.cues[1].end_ms == 900
    assert assets.arguments is not None
    metadata = cast(dict[str, object], assets.arguments["metadata"])
    assert metadata["alignment_method"] == "segmented_synthesis_v1"
    assert metadata["caption_cues"] == [
        {"text": "最初です。", "start_ms": 0, "end_ms": 500},
        {"text": "次です。", "start_ms": 500, "end_ms": 900},
    ]
