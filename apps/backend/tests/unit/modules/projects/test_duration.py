from douga.modules.projects.service import ProjectService


def test_estimated_duration_uses_longest_content_at_editor_precision() -> None:
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

    assert ProjectService._estimated_duration(document) == 14000


def test_estimated_duration_has_a_short_minimum() -> None:
    document: dict[str, object] = {
        "video": {},
        "scenes": [{"dialogues": [], "layers": []}],
    }

    assert ProjectService._estimated_duration(document) == 100


def test_estimated_duration_includes_delayed_dialogue() -> None:
    document = {
        "video": {},
        "scenes": [
            {
                "dialogues": [
                    {
                        "text": "delayed",
                        "start_ms": 6000,
                        "duration_ms": 2000,
                    }
                ],
                "layers": [],
            }
        ],
    }

    assert ProjectService._estimated_duration(document) == 8000


def test_estimated_duration_includes_camera_effects() -> None:
    document = {
        "video": {},
        "scenes": [{"dialogues": [], "layers": []}],
        "camera_effects": [{"end_ms": 12001}],
    }

    assert ProjectService._estimated_duration(document) == 12050
