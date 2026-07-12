from typing import Any

from douga.modules.exports.service import scale_project_document


def test_preview_scales_caption_layers_and_keyframes_to_output_resolution() -> None:
    document: dict[str, Any] = {
        "video": {"width": 1920, "height": 1080, "fps": 30},
        "caption_style": {
            "x": 140,
            "y": 760,
            "width": 1640,
            "height": 240,
            "padding": 24,
            "font_size": 56,
            "border_radius": 20,
        },
        "scenes": [
            {
                "layers": [
                    {
                        "x": 100,
                        "y": 200,
                        "width": 800,
                        "height": 400,
                        "font_size": 60,
                        "keyframes": [
                            {
                                "x": 200,
                                "y": 300,
                                "width": 1000,
                                "height": 500,
                            }
                        ],
                    }
                ]
            }
        ],
    }

    scale_project_document(document, 960, 540)

    assert document["video"] == {"width": 960, "height": 540, "fps": 30}
    caption = document["caption_style"]
    assert caption["x"] == 70
    assert caption["font_size"] == 28
    layer = document["scenes"][0]["layers"][0]
    assert layer["x"] == 50
    assert layer["y"] == 100
    assert layer["font_size"] == 30
    assert layer["keyframes"][0]["width"] == 500
