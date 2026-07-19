from typing import cast
from uuid import UUID, uuid4

import pytest
from douga.integrations.aivis_speech import AivisVoice, AivisVoiceStyle
from douga.modules.assets.service import AssetView
from douga.modules.assistant.tools import speech_tools
from douga.modules.assistant.tools.registry import ToolContext
from douga.modules.speech.schemas import SpeechSynthesisRequest
from sqlalchemy.ext.asyncio import AsyncSession


class FakeSpeechService:
    synthesis_request: SpeechSynthesisRequest | None = None
    synthesis_user_id: UUID | None = None

    def __init__(self, session: AsyncSession) -> None:
        del session

    async def list_voices(self) -> tuple[AivisVoice, ...]:
        return (
            AivisVoice(
                speaker_uuid="speaker-1",
                name="Anneli",
                styles=(AivisVoiceStyle(id=42, name="Normal"),),
            ),
        )

    async def synthesize(self, user_id: UUID, request: SpeechSynthesisRequest) -> AssetView:
        type(self).synthesis_user_id = user_id
        type(self).synthesis_request = request
        return AssetView(
            id=uuid4(),
            kind="audio",
            source="generated",
            status="ready",
            name=request.name or request.text[:40],
            original_filename="narration.wav",
            mime_type="audio/wav",
            size_bytes=1_000,
            width=None,
            height=None,
            duration_ms=2_400,
            tags=[],
        )


def context() -> ToolContext:
    return ToolContext(
        session=cast(AsyncSession, object()),
        run_id=uuid4(),
        project_id=uuid4(),
        user_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_lists_aivis_speech_voices_for_style_selection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(speech_tools, "SpeechService", FakeSpeechService)

    result = await speech_tools.list_speech_voices(context(), {})

    assert result.data == {
        "voices": [
            {
                "speaker_uuid": "speaker-1",
                "name": "Anneli",
                "styles": [{"id": 42, "name": "Normal"}],
            }
        ]
    }


@pytest.mark.asyncio
async def test_generates_owned_narration_asset_with_selected_voice_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(speech_tools, "SpeechService", FakeSpeechService)
    tool_context = context()

    result = await speech_tools.generate_narration(
        tool_context,
        {
            "text": "これはテストナレーションです。",
            "style_id": 42,
            "name": "導入ナレーション",
            "speed_scale": 1.1,
            "intonation_scale": 0.9,
            "tempo_dynamics_scale": 1.0,
            "volume_scale": 1.0,
        },
    )

    assert FakeSpeechService.synthesis_user_id == tool_context.user_id
    assert FakeSpeechService.synthesis_request is not None
    assert FakeSpeechService.synthesis_request.text == "これはテストナレーションです。"
    assert FakeSpeechService.synthesis_request.style_id == 42
    assert result.data["asset"]["duration_ms"] == 2_400
    assert result.data["asset"]["kind"] == "audio"
    assert result.artifact is not None
    assert result.artifact["type"] == "audio"
