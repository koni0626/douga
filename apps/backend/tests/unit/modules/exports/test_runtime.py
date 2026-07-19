from douga.modules.exports.runtime import calculate_export_timeout_seconds


def test_short_export_uses_configured_minimum_timeout() -> None:
    timeout = calculate_export_timeout_seconds(
        {"project": {"video": {"duration_ms": 5_000}}},
        minimum_timeout_seconds=900,
    )

    assert timeout == 900


def test_long_export_scales_timeout_with_video_duration() -> None:
    timeout = calculate_export_timeout_seconds(
        {"project": {"video": {"duration_ms": 1_302_028}}},
        minimum_timeout_seconds=900,
    )

    assert timeout == 26_341


def test_range_export_only_uses_selected_duration() -> None:
    timeout = calculate_export_timeout_seconds(
        {
            "project": {"video": {"duration_ms": 1_302_028}},
            "range_start_ms": 100_000,
            "range_end_ms": 105_000,
        },
        minimum_timeout_seconds=900,
    )

    assert timeout == 900


def test_export_timeout_is_capped_at_one_day() -> None:
    timeout = calculate_export_timeout_seconds(
        {"project": {"video": {"duration_ms": 100_000_000}}},
        minimum_timeout_seconds=900,
    )

    assert timeout == 86_400
