import pytest
from douga.modules.assistant.tools.animation_tools import AnimationPreset, frames

PRESETS: tuple[AnimationPreset, ...] = (
    "slide_left",
    "slide_right",
    "slide_up",
    "slide_down",
    "zoom_in",
    "pop",
    "bounce",
    "shake",
    "spin",
    "pulse",
    "float",
    "fade_in",
    "fade_out",
    "blink",
    "flash",
)


@pytest.mark.parametrize("preset", PRESETS)
def test_every_animation_preset_produces_bounded_frames(preset: AnimationPreset) -> None:
    layer = {
        "id": "layer-1",
        "type": "image",
        "x": 100,
        "y": 100,
        "width": 640,
        "height": 360,
        "rotation": 0,
        "opacity": 1,
        "flip_x": False,
        "flip_y": False,
    }

    result = frames(layer, preset, 1000, 2000, 1920, 1080)

    assert len(result) >= 2
    assert result[0][1] == 1000
    assert result[-1][1] == 3000
    assert all(0 <= float(item[0]["opacity"]) <= 1 for item in result)
