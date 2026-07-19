from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from douga.modules.assistant.tools import timeline_tools
from douga.modules.assistant.tools.registry import ToolContext
from sqlalchemy.ext.asyncio import AsyncSession


class FakeProjectToolService:
    document: dict[str, Any]

    def __init__(self, context: ToolContext) -> None:
        del context

    async def detail(self) -> SimpleNamespace:
        return SimpleNamespace(
            document=type(self).document,
            project=SimpleNamespace(current_revision_number=2),
        )

    async def mutate(self, mutator: object, change_summary: str) -> tuple[object, object]:
        assert change_summary == "AI: duplicate audio clip"
        cast(Any, mutator)(type(self).document)
        return await self.detail(), SimpleNamespace(result_revision_number=2)


class FakeAssetService:
    checked: tuple[UUID, UUID, str] | None = None

    def __init__(self, session: AsyncSession) -> None:
        del session

    async def assert_ready_kind(self, asset_id: UUID, user_id: UUID, kind: str) -> None:
        type(self).checked = (asset_id, user_id, kind)


def context(user_id: UUID) -> ToolContext:
    return ToolContext(
        session=cast(AsyncSession, object()),
        run_id=uuid4(),
        project_id=uuid4(),
        user_id=user_id,
    )


@pytest.mark.asyncio
async def test_duplicate_audio_clip_fills_range_and_trims_last_copy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    asset_id = uuid4()
    source_clip_id = str(uuid4())
    FakeProjectToolService.document = {
        "video": {"duration_ms": 21_000},
        "scenes": [{"layers": [], "dialogues": []}],
        "audio_tracks": [
            {
                "id": source_clip_id,
                "asset_id": str(asset_id),
                "role": "bgm",
                "start_ms": 0,
                "duration_ms": 7_000,
                "trim_start_ms": 500,
                "volume": 0.8,
                "loop": False,
                "fade_in_ms": 1_000,
                "fade_out_ms": 2_000,
                "ducking": False,
                "scene_id": None,
                "dialogue_id": None,
            }
        ],
    }
    monkeypatch.setattr(timeline_tools, "ProjectToolService", FakeProjectToolService)
    monkeypatch.setattr(timeline_tools, "AssetService", FakeAssetService)

    result = await timeline_tools.duplicate_audio_clip(
        context(user_id),
        {"clip_id": source_clip_id, "start_ms": 7_000, "end_ms": 18_500},
    )

    copies = FakeProjectToolService.document["audio_tracks"][1:]
    assert [(item["start_ms"], item["duration_ms"]) for item in copies] == [
        (7_000, 7_000),
        (14_000, 4_500),
    ]
    assert all(item["asset_id"] == str(asset_id) for item in copies)
    assert all(item["trim_start_ms"] == 500 for item in copies)
    assert len(set(result.data["clip_ids"])) == 2
    assert FakeAssetService.checked == (asset_id, user_id, "audio")
