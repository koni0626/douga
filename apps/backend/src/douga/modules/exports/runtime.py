import math
from typing import Any

EXPORT_TIMEOUT_SECONDS_PER_VIDEO_SECOND = 20
EXPORT_TIMEOUT_STARTUP_GRACE_SECONDS = 300
MAX_EXPORT_TIMEOUT_SECONDS = 24 * 60 * 60


def calculate_export_timeout_seconds(
    render_input: dict[str, Any],
    *,
    minimum_timeout_seconds: int,
) -> int:
    project = render_input.get("project")
    video = project.get("video") if isinstance(project, dict) else None
    duration_ms = video.get("duration_ms", 0) if isinstance(video, dict) else 0
    if not isinstance(duration_ms, int | float) or duration_ms <= 0:
        return minimum_timeout_seconds

    range_start_ms = render_input.get("range_start_ms")
    range_end_ms = render_input.get("range_end_ms")
    start_ms = (
        float(range_start_ms)
        if isinstance(range_start_ms, int | float) and range_start_ms >= 0
        else 0.0
    )
    end_ms = (
        min(float(range_end_ms), float(duration_ms))
        if isinstance(range_end_ms, int | float) and range_end_ms > start_ms
        else float(duration_ms)
    )
    rendered_duration_seconds = max(0.001, (end_ms - start_ms) / 1000)
    duration_based_timeout = math.ceil(
        rendered_duration_seconds * EXPORT_TIMEOUT_SECONDS_PER_VIDEO_SECOND
        + EXPORT_TIMEOUT_STARTUP_GRACE_SECONDS
    )
    return min(
        MAX_EXPORT_TIMEOUT_SECONDS,
        max(minimum_timeout_seconds, duration_based_timeout),
    )
