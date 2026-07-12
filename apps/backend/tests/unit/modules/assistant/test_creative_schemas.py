import pytest
from douga.modules.assistant.creative_schemas import CreativeKind, validate_creative_content
from pydantic import ValidationError


@pytest.mark.parametrize(
    ("kind", "content"),
    [
        (
            "brief",
            {
                "purpose": "Company introduction",
                "target_audience": "Prospective customers",
                "core_message": "Small teams can innovate",
                "tone": "Trustworthy",
                "target_duration_ms": 30_000,
                "aspect_ratio": "16:9",
                "constraints": ["No jargon"],
            },
        ),
        (
            "plot",
            {
                "title": "Revival",
                "logline": "A factory changes",
                "sections": [
                    {
                        "id": "opening",
                        "title": "Opening",
                        "summary": "The problem",
                        "purpose": "Build empathy",
                        "duration_ms": 5_000,
                    }
                ],
            },
        ),
        (
            "script",
            {
                "title": "Revival",
                "blocks": [
                    {
                        "id": "block-1",
                        "start_ms": 0,
                        "end_ms": 5_000,
                        "narration": "The factory was quiet.",
                        "caption": "The factory was quiet.",
                        "visual_direction": "Wide exterior",
                        "plot_section_id": "opening",
                    }
                ],
            },
        ),
        (
            "storyboard",
            {
                "title": "Revival",
                "shots": [
                    {
                        "id": "shot-1",
                        "start_ms": 0,
                        "end_ms": 5_000,
                        "description": "Slow zoom into the factory",
                        "asset_requirements": ["Night factory"],
                        "camera": {"preset": "slow_zoom_in", "intensity": 0.4},
                        "script_block_ids": ["block-1"],
                    }
                ],
            },
        ),
    ],
)
def test_validates_each_creative_document_kind(
    kind: CreativeKind, content: dict[str, object]
) -> None:
    validated = validate_creative_content(kind, content)
    assert validated


def test_rejects_invalid_script_time_range() -> None:
    with pytest.raises(ValidationError):
        validate_creative_content(
            "script",
            {
                "title": "Invalid",
                "blocks": [
                    {
                        "id": "block-1",
                        "start_ms": 5000,
                        "end_ms": 1000,
                        "narration": "",
                        "caption": "",
                        "visual_direction": "",
                        "plot_section_id": None,
                    }
                ],
            },
        )
