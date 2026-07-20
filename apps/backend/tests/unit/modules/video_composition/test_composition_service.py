import io
import wave
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from douga.core.errors import ApplicationError, NotFoundError
from douga.integrations.aivis_speech import AivisVoice, AivisVoiceStyle
from douga.modules.assets.service import AssetService, AssetView
from douga.modules.projects.service import ProjectDetail, ProjectService, ProjectSummary
from douga.modules.video_composition.schemas import NarratedVideoInput
from douga.modules.video_composition.service import VideoCompositionService
from douga.modules.video_composition.validator import (
    NarratedVideoValidation,
    NarratedVideoValidator,
    ValidationIssue,
)
from sqlalchemy.ext.asyncio import AsyncSession


def _wav(frame_count: int = 500) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(1_000)
        stream.writeframes(b"\0\0" * frame_count)
    return output.getvalue()


def _detail(revision: int = 4, lock_version: int = 7) -> ProjectDetail:
    project_id = uuid4()
    return ProjectDetail(
        ProjectSummary(
            id=project_id,
            name="Narrated",
            status="draft",
            content_locale="ja",
            current_revision_number=revision,
            lock_version=lock_version,
            scene_count=1,
            estimated_duration_ms=5_000,
            thumbnail_asset_id=None,
            updated_at=datetime.now(UTC),
        ),
        {
            "schema_version": 1,
            "project_id": str(project_id),
            "name": "Narrated",
            "content_locale": "ja",
            "video": {"width": 1920, "height": 1080, "fps": 10},
            "caption_style": {
                "x": 100,
                "y": 800,
                "width": 1720,
                "height": 200,
                "padding": 20,
                "font_family": "Noto Sans JP",
                "font_size": 40,
                "font_weight": 700,
                "line_height": 1.3,
                "max_lines": 3,
                "text_color": "#FFFFFF",
                "background_color": "#000000",
                "background_opacity": 0.7,
                "border_radius": 10,
                "text_align": "left",
            },
            "scenes": [
                {
                    "id": str(uuid4()),
                    "name": "Canvas",
                    "background": {"type": "color", "color": "#000000"},
                    "layers": [],
                    "dialogues": [],
                }
            ],
            "audio_tracks": [],
        },
    )


class FakeSpeechClient:
    def __init__(self) -> None:
        self.texts: list[str] = []

    async def list_voices(self) -> tuple[AivisVoice, ...]:
        return (AivisVoice("voice", "Voice", (AivisVoiceStyle(42, "Normal"),)),)

    async def synthesize(self, **arguments: object) -> bytes:
        self.texts.append(str(arguments["text"]))
        return _wav()


class FakeAssets:
    def __init__(self) -> None:
        self.asset_id = uuid4()
        self.metadata: dict[str, object] | None = None
        self.discarded: list[UUID] = []

    async def assert_ready_kind(self, *args: object) -> None:
        return None

    async def create_generated_audio(
        self, user_id: UUID, **arguments: object
    ) -> AssetView:
        del user_id
        self.metadata = cast(dict[str, object], arguments["metadata"])
        return AssetView(
            id=self.asset_id,
            kind="audio",
            source="generated",
            status="ready",
            name="master",
            original_filename="master.wav",
            mime_type="audio/wav",
            size_bytes=100,
            width=None,
            height=None,
            duration_ms=1_000,
            tags=[],
        )

    async def discard_generated_asset(self, asset_id: UUID, user_id: UUID) -> None:
        del user_id
        self.discarded.append(asset_id)


class FakeProjects:
    def __init__(self, detail: ProjectDetail, *, denied: bool = False) -> None:
        self.detail = detail
        self.denied = denied
        self.saved_documents: list[dict[str, Any]] = []

    async def get_project(self, project_id: UUID, user_id: UUID) -> ProjectDetail:
        del project_id, user_id
        if self.denied:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        return self.detail

    async def save_revision(
        self,
        project_id: UUID,
        user_id: UUID,
        expected_lock_version: int,
        document: dict[str, Any],
        change_summary: str,
    ) -> ProjectDetail:
        del project_id, user_id, expected_lock_version, change_summary
        self.saved_documents.append(document)
        summary = self.detail.project
        return ProjectDetail(
            ProjectSummary(
                id=summary.id,
                name=summary.name,
                status=summary.status,
                content_locale=summary.content_locale,
                current_revision_number=summary.current_revision_number + 1,
                lock_version=summary.lock_version + 1,
                scene_count=1,
                estimated_duration_ms=1_000,
                thumbnail_asset_id=None,
                updated_at=summary.updated_at,
            ),
            document,
        )


class RejectingValidator:
    def validate(self, *args: object, **kwargs: object) -> NarratedVideoValidation:
        del args, kwargs
        return NarratedVideoValidation(
            False, (ValidationIssue("forced", "/video"),)
        )


def _request() -> NarratedVideoInput:
    return NarratedVideoInput.model_validate(
        {
            "voice": {"style_id": 42},
            "sections": [
                {
                    "id": "section",
                    "title": "題名",
                    "cues": [
                        {"id": "one", "display_text": "辛い", "speech_text": "カライ"},
                        {"id": "two", "display_text": "二つ目"},
                    ],
                }
            ],
        }
    )


async def test_composes_one_master_audio_and_saves_exactly_one_revision() -> None:
    detail = _detail()
    speech = FakeSpeechClient()
    assets = FakeAssets()
    projects = FakeProjects(detail)
    progress_events: list[dict[str, Any]] = []

    async def emit_progress(event: dict[str, Any]) -> None:
        progress_events.append(event)

    service = VideoCompositionService(
        cast(AsyncSession, object()),
        speech_client=speech,  # type: ignore[arg-type]
        asset_service=cast(AssetService, assets),
        project_service=cast(ProjectService, projects),
    )

    result = await service.compose(
        detail.project.id,
        uuid4(),
        detail.project.current_revision_number,
        _request(),
        emit_progress=emit_progress,
    )

    assert result.detail.project.current_revision_number == 5
    assert speech.texts == ["カライ", "二つ目"]
    assert len(projects.saved_documents) == 1
    assert len(projects.saved_documents[0]["audio_tracks"]) == 1
    assert len(projects.saved_documents[0]["scenes"][0]["dialogues"]) == 2
    assert assets.metadata is not None
    assert assets.metadata["alignment_method"] == "master_segmented_synthesis_v1"
    assert assets.discarded == []
    assert progress_events[-1] == {"phase": "completed", "progress": 100}
    assert [event["progress"] for event in progress_events] == sorted(
        event["progress"] for event in progress_events
    )


async def test_validation_failure_discards_master_and_does_not_save_revision() -> None:
    detail = _detail()
    assets = FakeAssets()
    projects = FakeProjects(detail)
    service = VideoCompositionService(
        cast(AsyncSession, object()),
        speech_client=FakeSpeechClient(),  # type: ignore[arg-type]
        asset_service=cast(AssetService, assets),
        project_service=cast(ProjectService, projects),
        validator=cast(NarratedVideoValidator, RejectingValidator()),
    )

    with pytest.raises(ApplicationError) as caught:
        await service.compose(
            detail.project.id,
            uuid4(),
            detail.project.current_revision_number,
            _request(),
        )

    assert caught.value.code == "NARRATED_VIDEO_VALIDATION_FAILED"
    assert projects.saved_documents == []
    assert assets.discarded == [assets.asset_id]


async def test_denied_project_access_stops_before_synthesis() -> None:
    detail = _detail()
    speech = FakeSpeechClient()
    service = VideoCompositionService(
        cast(AsyncSession, object()),
        speech_client=speech,  # type: ignore[arg-type]
        asset_service=cast(AssetService, FakeAssets()),
        project_service=cast(ProjectService, FakeProjects(detail, denied=True)),
    )

    with pytest.raises(NotFoundError):
        await service.compose(detail.project.id, uuid4(), 4, _request())

    assert speech.texts == []
