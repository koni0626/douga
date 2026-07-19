import pytest
from douga.modules.exports.schemas import ExportCreateRequest, PreviewCreateRequest
from pydantic import ValidationError


def test_preview_defaults_to_ten_fps() -> None:
    request = PreviewCreateRequest(range_end_ms=1_000)

    assert request.fps == 10


def test_export_accepts_output_overrides_and_normalizes_filename() -> None:
    request = ExportCreateRequest(
        project_id="00000000-0000-0000-0000-000000000001",
        width=1920,
        height=1080,
        fps=10,
        filename="My video",
    )

    assert request.width == 1920
    assert request.height == 1080
    assert request.fps == 10
    assert request.filename == "My video.mp4"


@pytest.mark.parametrize("filename", ["../video.mp4", "bad/name.mp4", "CON.mp4"])
def test_export_rejects_unsafe_filename(filename: str) -> None:
    with pytest.raises(ValidationError):
        ExportCreateRequest(
            project_id="00000000-0000-0000-0000-000000000001",
            filename=filename,
        )
