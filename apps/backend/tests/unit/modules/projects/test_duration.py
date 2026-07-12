from douga.modules.projects.service import ProjectService


def test_estimated_duration_uses_longest_content_and_rounds_to_five_seconds() -> None:
    document = {
        "video": {"duration_ms": 7000},
        "scenes": [
            {
                "dialogues": [],
                "layers": [
                    {
                        "start_ms": 0,
                        "end_ms": 9000,
                        "keyframes": [{"time_ms": 12001}],
                    }
                ],
            }
        ],
        "audio_tracks": [{"start_ms": 1000, "duration_ms": 13000}],
    }

    assert ProjectService._estimated_duration(document) == 15000


def test_estimated_duration_has_a_five_second_minimum() -> None:
    document = {"video": {}, "scenes": [{"dialogues": [], "layers": []}]}

    assert ProjectService._estimated_duration(document) == 5000


def test_estimated_duration_includes_camera_effects() -> None:
    document = {
        "video": {},
        "scenes": [{"dialogues": [], "layers": []}],
        "camera_effects": [{"end_ms": 12001}],
    }

    assert ProjectService._estimated_duration(document) == 15000
