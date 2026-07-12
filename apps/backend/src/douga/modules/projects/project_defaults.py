from typing import Any, Literal

AspectRatio = Literal["16:9", "9:16"]

ASPECT_RATIO_DIMENSIONS: dict[AspectRatio, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
}
CAPTION_LAYOUT_FIELDS = {"x", "y", "width", "height", "padding", "font_size", "max_lines"}


def default_caption_style(width: int = 1920, height: int = 1080) -> dict[str, Any]:
    if height > width:
        return {
            "x": 72,
            "y": 1440,
            "width": 936,
            "height": 360,
            "padding": 36,
            "font_family": "sans-serif",
            "font_size": 52,
            "font_weight": 700,
            "line_height": 1.35,
            "max_lines": 3,
            "text_color": "#ffffff",
            "background_color": "#000000",
            "background_opacity": 0.75,
            "border_radius": 24,
            "text_align": "left",
        }
    return {
        "x": 140,
        "y": 760,
        "width": 1640,
        "height": 240,
        "padding": 40,
        "font_family": "sans-serif",
        "font_size": 56,
        "font_weight": 700,
        "line_height": 1.35,
        "max_lines": 2,
        "text_color": "#ffffff",
        "background_color": "#000000",
        "background_opacity": 0.75,
        "border_radius": 24,
        "text_align": "left",
    }


def project_dimensions(
    aspect_ratio: AspectRatio | None, default_width: int, default_height: int
) -> tuple[int, int]:
    if aspect_ratio is None:
        return default_width, default_height
    return ASPECT_RATIO_DIMENSIONS[aspect_ratio]


def project_caption_style(
    width: int,
    height: int,
    overrides: dict[str, Any],
    *,
    enforce_aspect_layout: bool,
) -> dict[str, Any]:
    defaults = default_caption_style(width, height)
    style = {**defaults, **overrides}
    if enforce_aspect_layout:
        style.update({key: defaults[key] for key in CAPTION_LAYOUT_FIELDS})
    return style
