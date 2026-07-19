from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from douga.modules.assets.models import Asset
from douga.modules.assets.service import AssetView
from douga.modules.assistant.tools import speech_alignment_tools
from douga.modules.assistant.tools.registry import ToolContext
from douga.modules.speech.service import SpeechCue, SyncedSpeechResult
from sqlalchemy.ext.asyncio import AsyncSession


def asset_view(asset_id: UUID, *, duration_ms: int = 2_000) -> AssetView:
    return AssetView(
        id=asset_id,
        kind="audio",
        source="generated",
        status="ready",
        name="同期ナレーション",
        original_filename="narration.wav",
        mime_type="audio/wav",
        size_bytes=1_000,
        width=None,
        height=None,
        duration_ms=duration_ms,
        tags=[],
    )


def source_asset(asset_id: UUID, user_id: UUID) -> Asset:
    return Asset(
        id=asset_id,
        user_id=user_id,
        scope="private",
        kind="audio",
        source="generated",
        status="ready",
        name="元ナレーション",
        original_filename="source.wav",
        mime_type="audio/wav",
        size_bytes=100,
        duration_ms=2_000,
        asset_metadata={
            "provider": "aivis_speech",
            "text": "最初です。次です。",
            "style_id": 42,
            "speed_scale": 1.0,
            "intonation_scale": 1.0,
            "tempo_dynamics_scale": 1.0,
            "volume_scale": 1.0,
        },
    )


def project_document(audio_clip_id: str, asset_id: UUID) -> dict[str, object]:
    return {
        "video": {"duration_ms": 5_000},
        "scenes": [
            {
                "background": {"type": "color", "color": "#000000"},
                "layers": [],
                "dialogues": [
                    {
                        "id": "old-caption",
                        "start_ms": 0,
                        "duration_ms": 2_000,
                        "text": "古い字幕",
                    }
                ],
            }
        ],
        "audio_tracks": [
            {
                "id": audio_clip_id,
                "asset_id": str(asset_id),
                "role": "narration",
                "start_ms": 0,
                "duration_ms": 2_000,
                "trim_start_ms": 0,
            }
        ],
    }


class FakeProjectToolService:
    document: dict[str, object]

    def __init__(self, context: ToolContext) -> None:
        del context

    async def detail(self) -> SimpleNamespace:
        return SimpleNamespace(
            document=type(self).document,
            project=SimpleNamespace(current_revision_number=2),
        )

    async def mutate(self, mutator: object, change_summary: str) -> tuple[object, object]:
        del change_summary
        cast(object, mutator)(type(self).document)  # type: ignore[operator]
        return await self.detail(), SimpleNamespace(result_revision_number=2)


class FakeAssetRepository:
    assets: dict[UUID, Asset] = {}

    def __init__(self, session: AsyncSession) -> None:
        del session

    async def get_owned(self, asset_id: UUID, user_id: UUID) -> Asset | None:
        asset = type(self).assets.get(asset_id)
        return asset if asset is not None and asset.user_id == user_id else None


class FakeSpeechService:
    replacement_asset_id = uuid4()

    def __init__(self, session: AsyncSession) -> None:
        del session

    async def synthesize_synced(self, *args: object, **kwargs: object) -> SyncedSpeechResult:
        del args, kwargs
        return SyncedSpeechResult(
            asset=asset_view(type(self).replacement_asset_id),
            cues=(
                SpeechCue(text="最初です。", start_ms=0, end_ms=1_000),
                SpeechCue(text="次です。", start_ms=1_000, end_ms=2_000),
            ),
        )


def context(user_id: UUID) -> ToolContext:
    return ToolContext(
        session=cast(AsyncSession, object()),
        run_id=uuid4(),
        project_id=uuid4(),
        user_id=user_id,
    )


@pytest.mark.asyncio
async def test_replaces_narration_and_creates_exact_measured_captions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    source_asset_id = uuid4()
    audio_clip_id = str(uuid4())
    FakeProjectToolService.document = project_document(audio_clip_id, source_asset_id)
    FakeAssetRepository.assets = {source_asset_id: source_asset(source_asset_id, user_id)}
    monkeypatch.setattr(speech_alignment_tools, "ProjectToolService", FakeProjectToolService)
    monkeypatch.setattr(speech_alignment_tools, "AssetRepository", FakeAssetRepository)
    monkeypatch.setattr(speech_alignment_tools, "SpeechService", FakeSpeechService)

    result = await speech_alignment_tools.create_synced_captions_from_narration(
        context(user_id),
        {
            "audio_clip_ids": [audio_clip_id],
            "max_chars_per_caption": 30,
            "display_effect": "instant",
            "replace_overlapping_captions": True,
        },
    )

    document = FakeProjectToolService.document
    audio = cast(list[dict[str, object]], document["audio_tracks"])[0]
    scene = cast(list[dict[str, object]], document["scenes"])[0]
    dialogues = cast(list[dict[str, object]], scene["dialogues"])
    assert audio["asset_id"] == str(FakeSpeechService.replacement_asset_id)
    assert audio["dialogue_id"] == dialogues[0]["id"]
    assert [(item["text"], item["start_ms"], item["duration_ms"]) for item in dialogues] == [
        ("最初です。", 0, 1_000),
        ("次です。", 1_000, 1_000),
    ]
    assert result.data["alignment_method"] == "segmented_synthesis_v1"
    assert result.revision_number == 2


@pytest.mark.asyncio
async def test_validates_caption_text_and_timing_from_alignment_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    aligned_asset_id = uuid4()
    audio_clip_id = str(uuid4())
    document = project_document(audio_clip_id, aligned_asset_id)
    scene = cast(list[dict[str, object]], document["scenes"])[0]
    scene["dialogues"] = [
        {"id": "caption-1", "start_ms": 0, "duration_ms": 1_000, "text": "最初です。"},
        {"id": "caption-2", "start_ms": 1_000, "duration_ms": 1_000, "text": "次です。"},
    ]
    aligned = source_asset(aligned_asset_id, user_id)
    aligned.asset_metadata = {
        **aligned.asset_metadata,
        "alignment_method": "segmented_synthesis_v1",
        "caption_cues": [
            {"text": "最初です。", "start_ms": 0, "end_ms": 1_000},
            {"text": "次です。", "start_ms": 1_000, "end_ms": 2_000},
        ],
    }
    FakeProjectToolService.document = document
    FakeAssetRepository.assets = {aligned_asset_id: aligned}
    monkeypatch.setattr(speech_alignment_tools, "ProjectToolService", FakeProjectToolService)
    monkeypatch.setattr(speech_alignment_tools, "AssetRepository", FakeAssetRepository)

    result = await speech_alignment_tools.validate_narration_caption_sync(
        context(user_id),
        {"audio_clip_ids": [audio_clip_id], "tolerance_ms": 20},
    )

    assert result.data["valid"] is True
    assert result.data["verified_caption_count"] == 2
    assert result.data["issues"] == []


@pytest.mark.asyncio
async def test_does_not_claim_sync_without_measured_alignment_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    asset_id = uuid4()
    audio_clip_id = str(uuid4())
    FakeProjectToolService.document = project_document(audio_clip_id, asset_id)
    FakeAssetRepository.assets = {asset_id: source_asset(asset_id, user_id)}
    monkeypatch.setattr(speech_alignment_tools, "ProjectToolService", FakeProjectToolService)
    monkeypatch.setattr(speech_alignment_tools, "AssetRepository", FakeAssetRepository)

    result = await speech_alignment_tools.validate_narration_caption_sync(
        context(user_id),
        {"audio_clip_ids": [audio_clip_id], "tolerance_ms": 20},
    )

    assert result.data["valid"] is False
    assert result.data["issues"] == [
        {"code": "alignment_metadata_missing", "clip_id": audio_clip_id}
    ]
