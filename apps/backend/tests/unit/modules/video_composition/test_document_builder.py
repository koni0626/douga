from typing import Any
from uuid import uuid4

from douga.modules.video_composition.audio_compiler import (
    CompiledCue,
    CompiledNarration,
)
from douga.modules.video_composition.document_builder import (
    GENERATED_PREFIX,
    NarratedVideoDocumentBuilder,
)
from douga.modules.video_composition.schemas import NarratedSectionInput
from douga.modules.video_composition.validator import NarratedVideoValidator


def _document() -> dict[str, Any]:
    project_id = uuid4()
    return {
        "schema_version": 1,
        "project_id": str(project_id),
        "name": "test",
        "content_locale": "ja",
        "video": {"width": 1920, "height": 1080, "fps": 10, "duration_ms": 5_000},
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
                "layers": [
                    {
                        "id": "manual-shape",
                        "type": "shape",
                        "shape": "rectangle",
                        "fill": "#FFFFFF",
                        "start_ms": 0,
                        "end_ms": 5_000,
                        "x": 0,
                        "y": 0,
                        "width": 10,
                        "height": 10,
                        "rotation": 0,
                        "opacity": 1,
                    },
                    {
                        "id": f"{GENERATED_PREFIX}visual:old",
                        "type": "shape",
                        "shape": "rectangle",
                        "fill": "#000000",
                        "start_ms": 0,
                        "end_ms": 5_000,
                        "x": 0,
                        "y": 0,
                        "width": 100,
                        "height": 100,
                        "rotation": 0,
                        "opacity": 1,
                    },
                ],
                "dialogues": [],
            }
        ],
        "audio_tracks": [
            {
                "id": "bgm",
                "asset_id": str(uuid4()),
                "role": "bgm",
                "start_ms": 0,
                "duration_ms": 5_000,
                "trim_start_ms": 0,
                "volume": 1,
                "loop": False,
                "fade_in_ms": 0,
                "fade_out_ms": 0,
                "ducking": False,
            },
            {
                "id": "old-narration",
                "asset_id": str(uuid4()),
                "role": "narration",
                "start_ms": 0,
                "duration_ms": 5_000,
                "trim_start_ms": 0,
                "volume": 1,
                "loop": False,
                "fade_in_ms": 0,
                "fade_out_ms": 0,
                "ducking": False,
            },
        ],
        "camera_effects": [
            {
                "id": "camera",
                "preset": "breathe",
                "start_ms": 0,
                "end_ms": 5_000,
                "intensity": 1,
                "period_ms": 1_000,
            }
        ],
    }


def _fixture() -> tuple[list[NarratedSectionInput], CompiledNarration]:
    sections = [
        NarratedSectionInput.model_validate(
            {
                "id": "section-1",
                "title": "第一章",
                "cues": [
                    {"id": "cue-1", "display_text": "表示一", "speech_text": "読み一"},
                    {"id": "cue-2", "display_text": "表示二"},
                ],
            }
        ),
        NarratedSectionInput.model_validate(
            {
                "id": "section-2",
                "title": "第二章",
                "cues": [{"id": "cue-3", "display_text": "表示三"}],
            }
        ),
    ]
    cues = (
        CompiledCue("cue-1", "section-1", "表示一", "読み一", 0, 1_000, 0, 1_000),
        CompiledCue(
            "cue-2", "section-1", "表示二", "表示二", 1_000, 2_500, 1_000, 2_500
        ),
        CompiledCue(
            "cue-3", "section-2", "表示三", "表示三", 2_500, 4_000, 2_500, 4_000
        ),
    )
    return sections, CompiledNarration(b"wav", cues, 1_000, 1, 2, 4_000, 4_000)


def test_builds_aligned_draft_and_preserves_bgm_camera_and_manual_layers() -> None:
    sections, narration = _fixture()
    asset_id = uuid4()

    document = NarratedVideoDocumentBuilder().build(
        _document(),
        sections=sections,
        narration=narration,
        master_audio_asset_id=asset_id,
        image_dimensions={},
        replace_scope="generated_draft",
    )

    scene = document["scenes"][0]
    assert any(layer["id"] == "manual-shape" for layer in scene["layers"])
    assert not any(layer["id"] == f"{GENERATED_PREFIX}visual:old" for layer in scene["layers"])
    assert [item["role"] for item in document["audio_tracks"]] == ["bgm", "narration"]
    assert document["camera_effects"][0]["id"] == "camera"
    assert [item["start_ms"] for item in scene["dialogues"]] == [0, 1_000, 2_500]
    assert [item["duration_ms"] for item in scene["dialogues"]] == [1_000, 1_500, 1_500]
    assert document["video"]["duration_ms"] == 4_000
    validation = NarratedVideoValidator().validate(
        document,
        sections=sections,
        narration=narration,
        master_audio_asset_id=asset_id,
    )
    assert validation.as_dict() == {"valid": True, "issues": []}


def test_validator_rejects_caption_timing_drift() -> None:
    sections, narration = _fixture()
    asset_id = uuid4()
    document = NarratedVideoDocumentBuilder().build(
        _document(),
        sections=sections,
        narration=narration,
        master_audio_asset_id=asset_id,
        image_dimensions={},
        replace_scope="generated_draft",
    )
    document["scenes"][0]["dialogues"][1]["start_ms"] += 100

    result = NarratedVideoValidator().validate(
        document,
        sections=sections,
        narration=narration,
        master_audio_asset_id=asset_id,
    )

    assert result.valid is False
    assert "caption_mismatch" in {issue.code for issue in result.issues}
