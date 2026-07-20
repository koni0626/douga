from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from jsonschema import Draft202012Validator

from douga.modules.projects.service import load_project_validator
from douga.modules.video_composition.audio_compiler import CompiledNarration
from douga.modules.video_composition.common import GENERATED_PREFIX
from douga.modules.video_composition.document_builder import section_timings
from douga.modules.video_composition.schemas import NarratedSectionInput


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    path: str
    expected: object | None = None
    actual: object | None = None

    def as_dict(self) -> dict[str, object | None]:
        return {
            "code": self.code,
            "path": self.path,
            "expected": self.expected,
            "actual": self.actual,
        }


@dataclass(frozen=True, slots=True)
class NarratedVideoValidation:
    valid: bool
    issues: tuple[ValidationIssue, ...]

    def as_dict(self) -> dict[str, object]:
        return {
            "valid": self.valid,
            "issues": [issue.as_dict() for issue in self.issues],
        }


class NarratedVideoValidator:
    def __init__(self, schema_validator: Draft202012Validator | None = None) -> None:
        self.schema_validator = schema_validator or load_project_validator()

    def validate(
        self,
        document: dict[str, Any],
        *,
        sections: list[NarratedSectionInput],
        narration: CompiledNarration,
        master_audio_asset_id: UUID,
        validate_visuals: bool = True,
    ) -> NarratedVideoValidation:
        issues: list[ValidationIssue] = []
        self._validate_schema(document, issues)
        scenes = document.get("scenes")
        if not isinstance(scenes, list) or not scenes:
            issues.append(ValidationIssue("canvas_missing", "/scenes"))
            return NarratedVideoValidation(False, tuple(issues))
        scene = scenes[0]
        self._validate_audio(document, narration, master_audio_asset_id, issues)
        self._validate_captions(scene, narration, issues)
        if validate_visuals:
            self._validate_visuals(scene, sections, narration, issues)
        self._validate_duration(document, narration, issues)
        self._validate_keyframes(scene, issues)
        return NarratedVideoValidation(not issues, tuple(issues))

    def _validate_schema(
        self, document: dict[str, Any], issues: list[ValidationIssue]
    ) -> None:
        for error in sorted(
            self.schema_validator.iter_errors(document), key=lambda item: list(item.path)
        ):
            path = "/" + "/".join(str(value) for value in error.path)
            issues.append(ValidationIssue("schema_invalid", path, actual=error.message))

    @staticmethod
    def _validate_audio(
        document: dict[str, Any],
        narration: CompiledNarration,
        master_audio_asset_id: UUID,
        issues: list[ValidationIssue],
    ) -> None:
        tracks = [
            track
            for track in document.get("audio_tracks", [])
            if str(track.get("id", "")).startswith(f"{GENERATED_PREFIX}master-audio")
        ]
        if len(tracks) != 1:
            issues.append(
                ValidationIssue("master_audio_count", "/audio_tracks", 1, len(tracks))
            )
            return
        track = tracks[0]
        expected = {
            "asset_id": str(master_audio_asset_id),
            "role": "narration",
            "start_ms": 0,
            "duration_ms": narration.duration_ms,
        }
        for key, value in expected.items():
            if track.get(key) != value:
                issues.append(
                    ValidationIssue(
                        "master_audio_mismatch",
                        f"/audio_tracks/{key}",
                        value,
                        track.get(key),
                    )
                )

    @staticmethod
    def _validate_captions(
        scene: dict[str, Any],
        narration: CompiledNarration,
        issues: list[ValidationIssue],
    ) -> None:
        captions = [
            dialogue
            for dialogue in scene.get("dialogues", [])
            if str(dialogue.get("id", "")).startswith(f"{GENERATED_PREFIX}dialogue:")
        ]
        if len(captions) != len(narration.cues):
            issues.append(
                ValidationIssue(
                    "caption_count", "/scenes/0/dialogues", len(narration.cues), len(captions)
                )
            )
        for index, cue in enumerate(narration.cues):
            if index >= len(captions):
                break
            caption = captions[index]
            expected = (cue.display_text, cue.start_ms, cue.end_ms - cue.start_ms)
            actual = (
                caption.get("text"),
                caption.get("start_ms"),
                caption.get("duration_ms"),
            )
            if actual != expected:
                issues.append(
                    ValidationIssue(
                        "caption_mismatch",
                        f"/scenes/0/dialogues/{index}",
                        expected,
                        actual,
                    )
                )

    @staticmethod
    def _validate_visuals(
        scene: dict[str, Any],
        sections: list[NarratedSectionInput],
        narration: CompiledNarration,
        issues: list[ValidationIssue],
    ) -> None:
        visuals = [
            layer
            for layer in scene.get("layers", [])
            if str(layer.get("id", "")).startswith(f"{GENERATED_PREFIX}visual:")
        ]
        timings = section_timings(sections, narration)
        actual = [
            (int(layer.get("start_ms", -1)), int(layer.get("end_ms", -1)))
            for layer in visuals
        ]
        expected = [(timing.start_ms, timing.end_ms) for timing in timings]
        if actual != expected:
            issues.append(
                ValidationIssue("visual_timing", "/scenes/0/layers", expected, actual)
            )

    @staticmethod
    def _validate_duration(
        document: dict[str, Any],
        narration: CompiledNarration,
        issues: list[ValidationIssue],
    ) -> None:
        duration = document.get("video", {}).get("duration_ms")
        if duration != narration.duration_ms:
            issues.append(
                ValidationIssue(
                    "video_duration", "/video/duration_ms", narration.duration_ms, duration
                )
            )

    @staticmethod
    def _validate_keyframes(
        scene: dict[str, Any], issues: list[ValidationIssue]
    ) -> None:
        for layer_index, layer in enumerate(scene.get("layers", [])):
            start_ms = int(layer.get("start_ms", 0))
            end_ms = int(layer.get("end_ms", 0))
            for keyframe_index, keyframe in enumerate(layer.get("keyframes", [])):
                time_ms = int(keyframe.get("time_ms", -1))
                if time_ms < start_ms or time_ms > end_ms:
                    issues.append(
                        ValidationIssue(
                            "keyframe_outside_clip",
                            f"/scenes/0/layers/{layer_index}/keyframes/{keyframe_index}",
                            (start_ms, end_ms),
                            time_ms,
                        )
                    )
