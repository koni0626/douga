from __future__ import annotations

from typing import Any

from douga.modules.video_composition.common import (
    GENERATED_PREFIX,
    SectionTiming,
    stable_id,
)
from douga.modules.video_composition.schemas import NarratedSectionInput


class NarratedVisualFactory:
    def section_layers(
        self,
        document: dict[str, Any],
        section: NarratedSectionInput,
        timing: SectionTiming,
        image_size: tuple[int, int] | None,
    ) -> list[dict[str, Any]]:
        width = int(document["video"]["width"])
        height = int(document["video"]["height"])
        track_id = f"{GENERATED_PREFIX}section:{stable_id(section.id)}"
        visual = self._primary_visual(
            section, timing, image_size, width, height, track_id
        )
        return [visual, *self._title_layers(section, timing, width, height, track_id)]

    @staticmethod
    def _title_layers(
        section: NarratedSectionInput,
        timing: SectionTiming,
        width: int,
        height: int,
        track_id: str,
    ) -> list[dict[str, Any]]:
        title_height = max(72, round(height * 0.075))
        title_x = round(width * 0.055)
        title_y = round(height * 0.065)
        title_width = round(width * 0.89)
        layout = (title_x, title_y, title_width, title_height)
        return [
            _title_background(section, timing, track_id, layout),
            _title_text(section, timing, track_id, layout, height),
        ]

    @staticmethod
    def _primary_visual(
        section: NarratedSectionInput,
        timing: SectionTiming,
        image_size: tuple[int, int] | None,
        canvas_width: int,
        canvas_height: int,
        track_id: str,
    ) -> dict[str, Any]:
        common = {
            "id": f"{GENERATED_PREFIX}visual:{stable_id(section.id)}",
            "track_id": track_id,
            "name": section.title,
            "start_ms": timing.start_ms,
            "end_ms": timing.end_ms,
            "rotation": 0,
            "opacity": 1,
            "flip_x": False,
            "flip_y": False,
            "locked": False,
        }
        if section.image_asset_id is None or image_size is None:
            return {
                **common,
                "type": "shape",
                "shape": "rectangle",
                "fill": "#16324F",
                "x": 0,
                "y": 0,
                "width": canvas_width,
                "height": canvas_height,
                "keyframes": [],
            }
        x, y, width, height = cover_geometry(
            image_size[0], image_size[1], canvas_width, canvas_height
        )
        return {
            **common,
            "type": "image",
            "asset_id": str(section.image_asset_id),
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "keyframes": animation_keyframes(
                section.animation, timing, x=x, y=y, width=width, height=height
            ),
        }


def cover_geometry(
    source_width: int, source_height: int, canvas_width: int, canvas_height: int
) -> tuple[float, float, float, float]:
    scale = max(canvas_width / source_width, canvas_height / source_height)
    width = source_width * scale
    height = source_height * scale
    return ((canvas_width - width) / 2, (canvas_height - height) / 2, width, height)


def _title_common(timing: SectionTiming, track_id: str) -> dict[str, Any]:
    return {
        "track_id": track_id,
        "start_ms": timing.start_ms,
        "end_ms": timing.end_ms,
        "rotation": 0,
        "flip_x": False,
        "flip_y": False,
        "locked": False,
        "keyframes": [],
    }


def _title_background(
    section: NarratedSectionInput,
    timing: SectionTiming,
    track_id: str,
    layout: tuple[int, int, int, int],
) -> dict[str, Any]:
    x, y, width, height = layout
    return {
        **_title_common(timing, track_id),
        "id": f"{GENERATED_PREFIX}title-bg:{stable_id(section.id)}",
        "type": "shape",
        "name": f"{section.title} title background",
        "shape": "rectangle",
        "fill": "#071421",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "opacity": 0.72,
    }


def _title_text(
    section: NarratedSectionInput,
    timing: SectionTiming,
    track_id: str,
    layout: tuple[int, int, int, int],
    canvas_height: int,
) -> dict[str, Any]:
    x, y, width, height = layout
    return {
        **_title_common(timing, track_id),
        "id": f"{GENERATED_PREFIX}title:{stable_id(section.id)}",
        "type": "text",
        "name": f"{section.title} title",
        "text": section.title,
        "writing_mode": "horizontal",
        "font_family": "Noto Sans JP",
        "font_size": max(32, round(canvas_height * 0.035)),
        "color": "#FFFFFF",
        "text_style": "solid",
        "display_effect": "instant",
        "x": x + round(height * 0.28),
        "y": y,
        "width": width - round(height * 0.56),
        "height": height,
        "opacity": 1,
    }


def animation_keyframes(
    animation: str,
    timing: SectionTiming,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
) -> list[dict[str, Any]]:
    if animation == "none":
        return []
    zoom_in = animation == "slow_zoom_in"
    start_scale, end_scale = (1.0, 1.06) if zoom_in else (1.06, 1.0)
    return [
        _keyframe(timing.start_ms, x, y, width, height, start_scale, "start"),
        _keyframe(timing.end_ms, x, y, width, height, end_scale, "end"),
    ]


def _keyframe(
    time_ms: int,
    x: float,
    y: float,
    width: float,
    height: float,
    scale: float,
    suffix: str,
) -> dict[str, Any]:
    scaled_width = width * scale
    scaled_height = height * scale
    return {
        "id": f"{GENERATED_PREFIX}keyframe:{suffix}:{time_ms}",
        "time_ms": time_ms,
        "easing": "ease_in_out",
        "x": x - (scaled_width - width) / 2,
        "y": y - (scaled_height - height) / 2,
        "width": scaled_width,
        "height": scaled_height,
        "rotation": 0,
        "opacity": 1,
        "flip_x": False,
        "flip_y": False,
    }
