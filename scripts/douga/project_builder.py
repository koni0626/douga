from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from typing import Any, cast
from uuid import NAMESPACE_URL, uuid5

from scripts.douga.client import DougaClient


def load_manifest(path: Path) -> dict[str, Any]:
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("manifest must be a JSON object")
    manifest = cast(dict[str, Any], parsed)
    if manifest.get("manifest_version") != 1:
        raise ValueError("manifest_version must be 1")
    return manifest


def create_draft(client: DougaClient, manifest_path: Path) -> dict[str, Any]:
    manifest_path = manifest_path.resolve()
    manifest = load_manifest(manifest_path)
    project_settings = manifest["project"]
    resolved_assets: list[tuple[dict[str, Any], Path]] = []
    asset_hashes: dict[str, str] = {}
    for item in manifest.get("assets", []):
        asset_path = (manifest_path.parent / item["path"]).resolve()
        if manifest_path.parent not in asset_path.parents:
            raise ValueError(f"asset path escapes manifest directory: {item['path']}")
        if not asset_path.is_file():
            raise FileNotFoundError(asset_path)
        asset_key = str(item["key"])
        if asset_key in asset_hashes:
            raise ValueError(f"duplicate asset key: {asset_key}")
        digest = client.sha256_file(asset_path)
        declared_digest = item.get("sha256")
        if declared_digest is not None and str(declared_digest).casefold() != digest:
            raise ValueError(f"asset sha256 does not match: {item['path']}")
        asset_hashes[asset_key] = digest
        resolved_assets.append((item, asset_path))
    run_key = str(manifest.get("idempotency_key") or _manifest_hash(manifest, asset_hashes))
    requested_project_id = manifest.get("project_id")
    if requested_project_id:
        created = client.get_project(str(requested_project_id))
    else:
        created = client.create_project(
            project_settings["name"],
            project_settings.get("locale", "ja"),
            aspect_ratio=(
                "9:16"
                if int(project_settings.get("height", 1080))
                > int(project_settings.get("width", 1920))
                else "16:9"
            ),
            key=f"manifest-{run_key}-project",
        )
    project_id = str(created["project"]["id"])
    assets: dict[str, dict[str, Any]] = {}
    for item, asset_path in resolved_assets:
        asset_key = str(item["key"])
        assets[asset_key] = client.upload_asset(asset_path, item["kind"], name=item.get("name"))
    document = build_project_document(project_id, manifest, assets)
    validation = client.validate_project(project_id, document)
    if not validation["valid"]:
        raise ValueError(f"Douga project validation failed: {validation['errors']}")
    current = client.get_project(project_id)
    if current["document"] == document:
        saved = current
    else:
        current_lock = int(current["project"]["lock_version"])
        if requested_project_id:
            if "base_lock_version" not in manifest:
                raise ValueError("base_lock_version is required when project_id is specified")
            expected_lock = int(manifest["base_lock_version"])
        else:
            expected_lock = int(created["project"]["lock_version"])
        if current_lock != expected_lock:
            raise ValueError(
                "Douga project changed after the draft started; refusing to overwrite human edits"
            )
        saved = client.save_revision(
            project_id,
            current_lock,
            document,
            change_summary="Codex created or revised an editable video draft",
            key=f"manifest-{run_key}-revision-{project_id}-{current_lock}",
        )
    if manifest.get("storyboard"):
        client.save_storyboard(project_id, manifest["storyboard"])
    return {
        "project": saved,
        "project_id": project_id,
        "editor_url": client.editor_url(project_id),
        "validation": validation,
        "asset_ids": {k: v["id"] for k, v in assets.items()},
        "operation_ids": list(client.operation_ids),
    }


def build_project_document(
    project_id: str, manifest: dict[str, Any], assets: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    settings = manifest["project"]
    width = int(settings.get("width", 1920))
    height = int(settings.get("height", 1080))
    duration = int(settings["duration_ms"])
    layers: list[dict[str, Any]] = []
    audio_tracks: list[dict[str, Any]] = []
    camera_effects: list[dict[str, Any]] = []
    ordered_clips = sorted(
        enumerate(manifest.get("clips", [])),
        key=lambda item: (int(item[1].get("z_index", 0)), item[0]),
    )
    for original_index, raw_clip in ordered_clips:
        clip = dict(raw_clip)
        if not clip.get("id"):
            canonical = json.dumps(
                raw_clip, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            clip["id"] = str(
                uuid5(NAMESPACE_URL, f"douga:{project_id}:clip:{original_index}:{canonical}")
            )
        clip_type = clip["type"]
        if clip_type == "image":
            asset = assets[clip["asset_key"]]
            layer = _image_layer(clip, asset, width, height)
            layers.append(layer)
        elif clip_type in {"caption", "text"}:
            layers.append(_text_layer(clip, width, height))
        elif clip_type == "shape":
            layers.append(_shape_layer(clip))
        elif clip_type == "audio":
            asset = assets[clip["asset_key"]]
            audio_tracks.append(_audio_track(clip, asset))
        elif clip_type == "camera":
            camera_effects.append(_camera_effect(clip))
        else:
            raise ValueError(f"unsupported clip type: {clip_type}")
    return {
        "schema_version": 1,
        "project_id": project_id,
        "name": settings["name"],
        "content_locale": settings.get("locale", "ja"),
        "video": {
            "width": width,
            "height": height,
            "fps": float(settings.get("fps", 30)),
            "duration_ms": duration,
        },
        "caption_style": _caption_style(manifest.get("caption_style", {}), width, height),
        "scenes": [
            {
                "id": "timeline-root",
                "name": "Timeline",
                "background": {"type": "color", "color": "#000000"},
                "layers": layers,
                "dialogues": [],
            }
        ],
        "audio_tracks": audio_tracks,
        "camera_effects": camera_effects,
    }


def _image_layer(
    clip: dict[str, Any], asset: dict[str, Any], canvas_width: int, canvas_height: int
) -> dict[str, Any]:
    source_width = int(asset.get("width") or canvas_width)
    source_height = int(asset.get("height") or canvas_height)
    fit = clip.get("fit", "contain")
    scale = (
        max(canvas_width / source_width, canvas_height / source_height)
        if fit == "cover"
        else min(canvas_width / source_width, canvas_height / source_height)
    )
    width = float(clip.get("width", source_width * scale))
    height = float(clip.get("height", source_height * scale))
    x = float(clip.get("x", (canvas_width - width) / 2))
    y = float(clip.get("y", (canvas_height - height) / 2))
    layer = _base_layer(clip, x, y, width, height)
    layer.update({"type": "image", "asset_id": asset["id"]})
    layer["keyframes"] = _animation_keyframes(clip, layer)
    return layer


def _text_layer(clip: dict[str, Any], canvas_width: int, canvas_height: int) -> dict[str, Any]:
    width = float(clip.get("width", canvas_width - 280))
    height = float(clip.get("height", 240))
    layer = _base_layer(
        clip,
        float(clip.get("x", 140)),
        float(clip.get("y", canvas_height - height - 80)),
        width,
        height,
    )
    layer.update(
        {
            "type": "text",
            "text": str(clip["text"]),
            "font_size": float(clip.get("font_size", 56)),
            "color": clip.get("color", "#ffffff"),
        }
    )
    layer["keyframes"] = _animation_keyframes(clip, layer)
    return layer


def _shape_layer(clip: dict[str, Any]) -> dict[str, Any]:
    layer = _base_layer(
        clip,
        float(clip.get("x", 0)),
        float(clip.get("y", 0)),
        float(clip.get("width", 320)),
        float(clip.get("height", 180)),
    )
    layer.update(
        {
            "type": "shape",
            "shape": clip.get("shape", "rectangle"),
            "fill": clip.get("fill", "#3ba7ff"),
        }
    )
    layer["keyframes"] = _animation_keyframes(clip, layer)
    return layer


def _base_layer(
    clip: dict[str, Any], x: float, y: float, width: float, height: float
) -> dict[str, Any]:
    return {
        "id": str(clip["id"]),
        "track_id": str(clip.get("track", "visual")),
        "name": str(clip.get("name") or clip.get("id") or clip["type"]),
        "start_ms": int(clip["start_ms"]),
        "end_ms": int(clip["end_ms"]),
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": float(clip.get("rotation", 0)),
        "opacity": float(clip.get("opacity", 1)),
        "flip_x": bool(clip.get("flip_x", False)),
        "flip_y": bool(clip.get("flip_y", False)),
        "locked": False,
        "keyframes": [],
    }


def _animation_keyframes(clip: dict[str, Any], layer: dict[str, Any]) -> list[dict[str, Any]]:
    explicit = clip.get("keyframes")
    if explicit is not None:
        if not isinstance(explicit, list):
            raise ValueError("keyframes must be an array")
        keyframes: list[dict[str, Any]] = []
        for index, overrides in enumerate(explicit):
            if not isinstance(overrides, dict):
                raise ValueError("each keyframe must be an object")
            if "time_ms" in overrides:
                time_ms = int(overrides["time_ms"])
            elif "offset_ms" in overrides:
                time_ms = int(clip["start_ms"]) + int(overrides["offset_ms"])
            else:
                raise ValueError("keyframe requires time_ms or offset_ms")
            keyframe = _keyframe(layer, time_ms, index)
            for field in (
                "easing",
                "x",
                "y",
                "width",
                "height",
                "rotation",
                "opacity",
                "flip_x",
                "flip_y",
            ):
                if field in overrides:
                    keyframe[field] = overrides[field]
            if overrides.get("id"):
                keyframe["id"] = str(overrides["id"])
            keyframes.append(keyframe)
        return keyframes
    preset = clip.get("animation")
    if not preset:
        return []
    start = int(clip["start_ms"])
    end = int(clip["end_ms"])
    first = _keyframe(layer, start, 0)
    last = _keyframe(layer, end, 1)
    if preset == "slow_zoom_in":
        last["x"] -= layer["width"] * 0.025
        last["y"] -= layer["height"] * 0.025
        last["width"] *= 1.05
        last["height"] *= 1.05
    elif preset == "slow_zoom_out":
        first["x"] -= layer["width"] * 0.025
        first["y"] -= layer["height"] * 0.025
        first["width"] *= 1.05
        first["height"] *= 1.05
    elif preset == "fade_in":
        first["opacity"] = 0
    elif preset == "fade_out":
        last["opacity"] = 0
    else:
        raise ValueError(f"unsupported animation: {preset}")
    return [first, last]


def _keyframe(layer: dict[str, Any], time_ms: int, index: int) -> dict[str, Any]:
    return {
        "id": str(uuid5(NAMESPACE_URL, f"douga:{layer['id']}:keyframe:{index}:{time_ms}")),
        "time_ms": time_ms,
        "easing": "ease_in_out",
        "x": layer["x"],
        "y": layer["y"],
        "width": layer["width"],
        "height": layer["height"],
        "rotation": layer["rotation"],
        "opacity": layer["opacity"],
        "flip_x": layer["flip_x"],
        "flip_y": layer["flip_y"],
    }


def _audio_track(clip: dict[str, Any], asset: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(clip["id"]),
        "asset_id": asset["id"],
        "role": clip.get("role", "narration"),
        "scene_id": None,
        "dialogue_id": None,
        "start_ms": int(clip["start_ms"]),
        "duration_ms": int(clip.get("duration_ms") or asset.get("duration_ms") or 1),
        "trim_start_ms": int(clip.get("trim_start_ms", 0)),
        "volume": float(clip.get("volume", 1)),
        "loop": bool(clip.get("loop", False)),
        "fade_in_ms": int(clip.get("fade_in_ms", 0)),
        "fade_out_ms": int(clip.get("fade_out_ms", 0)),
        "ducking": bool(clip.get("ducking", False)),
    }


def _camera_effect(clip: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(clip["id"]),
        "preset": clip["preset"],
        "start_ms": int(clip["start_ms"]),
        "end_ms": int(clip["end_ms"]),
        "intensity": float(clip.get("intensity", 1)),
        "period_ms": int(clip.get("period_ms", 4000)),
    }


def _caption_style(overrides: dict[str, Any], width: int, height: int) -> dict[str, Any]:
    return {
        "x": 140,
        "y": height - 320,
        "width": width - 280,
        "height": 240,
        "padding": 24,
        "font_family": "Noto Sans JP",
        "font_size": 56,
        "font_weight": 700,
        "line_height": 1.4,
        "max_lines": 2,
        "text_color": "#ffffff",
        "background_color": "#000000",
        "background_opacity": 0.72,
        "border_radius": 20,
        "text_align": "left",
        **overrides,
    }


def _manifest_hash(manifest: dict[str, Any], asset_hashes: dict[str, str]) -> str:
    canonical = json.dumps(
        {"manifest": manifest, "asset_hashes": asset_hashes},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return sha256(canonical).hexdigest()[:40]
