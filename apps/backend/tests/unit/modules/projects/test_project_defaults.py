from douga.modules.projects.project_defaults import (
    default_caption_style,
    project_caption_style,
    project_dimensions,
)


def test_landscape_project_defaults() -> None:
    assert project_dimensions("16:9", 1280, 720) == (1920, 1080)
    style = default_caption_style(1920, 1080)
    assert (style["x"], style["y"], style["width"], style["height"]) == (
        140,
        760,
        1640,
        240,
    )
    assert style["font_size"] == 56
    assert style["max_lines"] == 2


def test_portrait_project_defaults() -> None:
    assert project_dimensions("9:16", 1920, 1080) == (1080, 1920)
    style = default_caption_style(1080, 1920)
    assert (style["x"], style["y"], style["width"], style["height"]) == (
        72,
        1440,
        936,
        360,
    )
    assert style["font_size"] == 52
    assert style["max_lines"] == 3


def test_explicit_aspect_keeps_layout_safe_while_preserving_visual_overrides() -> None:
    style = project_caption_style(
        1080,
        1920,
        {"x": 140, "width": 1640, "font_size": 80, "text_color": "#ff00ff"},
        enforce_aspect_layout=True,
    )

    assert style["x"] == 72
    assert style["width"] == 936
    assert style["font_size"] == 52
    assert style["text_color"] == "#ff00ff"


def test_omitted_aspect_preserves_user_caption_overrides() -> None:
    assert project_dimensions(None, 1280, 720) == (1280, 720)
    style = project_caption_style(
        1280,
        720,
        {"x": 24, "font_size": 44},
        enforce_aspect_layout=False,
    )

    assert style["x"] == 24
    assert style["font_size"] == 44
