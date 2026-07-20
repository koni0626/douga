from __future__ import annotations

from copy import deepcopy
from typing import Any, cast
from uuid import UUID

from douga.core.errors import ApplicationError
from douga.modules.video_composition.audio_compiler import CompiledNarration
from douga.modules.video_composition.common import (
    GENERATED_PREFIX,
    SectionTiming,
    stable_id,
)
from douga.modules.video_composition.schemas import NarratedSectionInput
from douga.modules.video_composition.visual_factory import NarratedVisualFactory


class NarratedVideoDocumentBuilder:
    def __init__(self, visual_factory: NarratedVisualFactory | None = None) -> None:
        self.visual_factory = visual_factory or NarratedVisualFactory()

    def build(
        self,
        source_document: dict[str, Any],
        *,
        sections: list[NarratedSectionInput],
        narration: CompiledNarration,
        master_audio_asset_id: UUID,
        image_dimensions: dict[UUID, tuple[int, int]],
        replace_scope: str,
        ripple_visuals: bool = True,
    ) -> dict[str, Any]:
        document = deepcopy(source_document)
        scene = self._canvas(document)
        self._clear_replaced_content(document, scene, replace_scope, ripple_visuals)
        timings = section_timings(sections, narration)
        if ripple_visuals:
            for section, timing in zip(sections, timings, strict=True):
                scene["layers"].extend(
                    self.visual_factory.section_layers(
                        document,
                        section,
                        timing,
                        image_dimensions.get(section.image_asset_id)
                        if section.image_asset_id is not None
                        else None,
                    )
                )
        scene["dialogues"].extend(self._dialogues(narration))
        document.setdefault("audio_tracks", []).append(
            self._narration_track(master_audio_asset_id, narration.duration_ms)
        )
        document["video"]["duration_ms"] = narration.duration_ms
        document["caption_style"] = bottom_box_caption_style(document)
        return document

    @staticmethod
    def _canvas(document: dict[str, Any]) -> dict[str, Any]:
        scenes = document.get("scenes")
        if not isinstance(scenes, list) or not scenes:
            raise ApplicationError(
                "NARRATED_VIDEO_INPUT_INVALID", "errors.projectCanvasNotFound", 422
            )
        return cast(dict[str, Any], scenes[0])

    @staticmethod
    def _clear_replaced_content(
        document: dict[str, Any],
        scene: dict[str, Any],
        replace_scope: str,
        ripple_visuals: bool,
    ) -> None:
        if replace_scope == "entire_timeline":
            scene["layers"] = []
            scene["dialogues"] = []
            document["audio_tracks"] = []
            document["camera_effects"] = []
            return
        if ripple_visuals:
            scene["layers"] = [
                layer
                for layer in scene.get("layers", [])
                if not str(layer.get("id", "")).startswith(GENERATED_PREFIX)
            ]
        scene["dialogues"] = [
            dialogue
            for dialogue in scene.get("dialogues", [])
            if not str(dialogue.get("id", "")).startswith(GENERATED_PREFIX)
        ]
        # A composed draft has one narration master. BGM and effects remain untouched.
        document["audio_tracks"] = [
            track
            for track in document.get("audio_tracks", [])
            if track.get("role") != "narration"
        ]

    @staticmethod
    def _dialogues(narration: CompiledNarration) -> list[dict[str, Any]]:
        return [
            {
                "id": f"{GENERATED_PREFIX}dialogue:{stable_id(cue.cue_id)}",
                "speaker": None,
                "start_ms": cue.start_ms,
                "text": cue.display_text,
                "display_effect": "instant",
                "duration_mode": "narration",
                "duration_ms": cue.end_ms - cue.start_ms,
                "manual_page_breaks": [],
            }
            for cue in narration.cues
        ]

    @staticmethod
    def _narration_track(asset_id: UUID, duration_ms: int) -> dict[str, Any]:
        return {
            "id": f"{GENERATED_PREFIX}master-audio",
            "asset_id": str(asset_id),
            "role": "narration",
            "scene_id": None,
            "dialogue_id": None,
            "start_ms": 0,
            "duration_ms": duration_ms,
            "trim_start_ms": 0,
            "volume": 1,
            "loop": False,
            "fade_in_ms": 20,
            "fade_out_ms": 80,
            "ducking": False,
        }


def section_timings(
    sections: list[NarratedSectionInput], narration: CompiledNarration
) -> tuple[SectionTiming, ...]:
    cues_by_section: dict[str, list[Any]] = {section.id: [] for section in sections}
    for cue in narration.cues:
        if cue.section_id not in cues_by_section:
            raise ApplicationError(
                "NARRATED_VIDEO_INPUT_INVALID", "errors.assistantToolArgumentsInvalid", 422
            )
        cues_by_section[cue.section_id].append(cue)
    return tuple(
        SectionTiming(
            section_id=section.id,
            start_ms=cues_by_section[section.id][0].start_ms,
            end_ms=cues_by_section[section.id][-1].end_ms,
        )
        for section in sections
    )


def bottom_box_caption_style(document: dict[str, Any]) -> dict[str, Any]:
    width = int(document["video"]["width"])
    height = int(document["video"]["height"])
    return {
        "x": round(width * 0.055),
        "y": round(height * 0.76),
        "width": round(width * 0.89),
        "height": round(height * 0.18),
        "padding": max(16, round(height * 0.018)),
        "font_family": "Noto Sans JP",
        "font_size": max(32, round(height * 0.035)),
        "font_weight": 700,
        "line_height": 1.35,
        "max_lines": 3,
        "text_color": "#FFFFFF",
        "background_color": "#020B12",
        "background_opacity": 0.78,
        "border_radius": max(12, round(height * 0.012)),
        "text_align": "left",
    }
