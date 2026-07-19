import json
import sys
from pathlib import Path
from typing import cast

import pytest
from douga.modules.projects.service import load_project_validator

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))

from scripts.douga.client import DougaClient
from scripts.douga.project_builder import _manifest_hash, build_project_document, create_draft


def test_manifest_builds_single_timeline_with_ordered_editable_clips() -> None:
    manifest = {
        "manifest_version": 1,
        "project": {
            "name": "YouTube draft",
            "locale": "ja",
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "duration_ms": 10_000,
        },
        "clips": [
            {
                "id": "caption",
                "track": "caption",
                "type": "caption",
                "text": "test caption",
                "start_ms": 500,
                "end_ms": 4_000,
                "z_index": 10,
                "display_effect": "fade",
            },
            {
                "id": "background",
                "track": "background",
                "type": "image",
                "asset_key": "background",
                "start_ms": 0,
                "end_ms": 10_000,
                "z_index": 0,
                "fit": "cover",
                "animation": "slow_zoom_in",
            },
        ],
    }
    assets = {
        "background": {
            "id": "326447f0-9bec-4fc0-bdd2-c073a8847693",
            "width": 1024,
            "height": 1024,
        }
    }

    document = build_project_document("132d2f55-c1c6-4387-9536-67c881f9f9cd", manifest, assets)
    repeated = build_project_document("132d2f55-c1c6-4387-9536-67c881f9f9cd", manifest, assets)

    assert len(document["scenes"]) == 1
    assert document["scenes"][0]["id"] == "timeline-root"
    assert [layer["id"] for layer in document["scenes"][0]["layers"]] == ["background"]
    assert document["scenes"][0]["layers"][0]["width"] > 1024
    assert (
        document["scenes"][0]["layers"][0]["keyframes"][1]["width"]
        > document["scenes"][0]["layers"][0]["width"]
    )
    assert document["scenes"][0]["dialogues"] == [
        {
            "id": "caption",
            "speaker": None,
            "start_ms": 500,
            "text": "test caption",
            "display_effect": "fade",
            "duration_mode": "manual",
            "duration_ms": 3_500,
            "manual_page_breaks": [],
        }
    ]
    assert repeated == document
    assert list(load_project_validator().iter_errors(document)) == []


def test_manifest_supports_deterministic_custom_keyframes_without_clip_ids() -> None:
    manifest = {
        "manifest_version": 1,
        "project": {"name": "Custom", "duration_ms": 5_000},
        "clips": [
            {
                "track": "visual",
                "type": "shape",
                "start_ms": 0,
                "end_ms": 5_000,
                "keyframes": [
                    {"offset_ms": 0, "x": 0, "easing": "linear"},
                    {
                        "offset_ms": 5_000,
                        "x": 100,
                        "rotation": 45,
                        "easing": "bounce",
                    },
                ],
            }
        ],
    }
    project_id = "132d2f55-c1c6-4387-9536-67c881f9f9cd"

    first = build_project_document(project_id, manifest, {})
    second = build_project_document(project_id, manifest, {})

    assert first == second
    keyframes = first["scenes"][0]["layers"][0]["keyframes"]
    assert keyframes[0]["time_ms"] == 0
    assert keyframes[1]["time_ms"] == 5_000
    assert keyframes[1]["x"] == 100
    assert keyframes[1]["rotation"] == 45
    assert list(load_project_validator().iter_errors(first)) == []


def test_draft_validates_all_local_assets_before_creating_project(tmp_path: Path) -> None:
    manifest = {
        "manifest_version": 1,
        "project": {"name": "Missing asset", "duration_ms": 5_000},
        "assets": [{"key": "missing", "path": "assets/missing.png", "kind": "image"}],
        "clips": [],
    }
    manifest_path = tmp_path / "douga_manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    class NeverCreateClient:
        def create_project(self, *_: object, **__: object) -> dict[str, object]:
            raise AssertionError("project creation must not run")

    with pytest.raises(FileNotFoundError):
        create_draft(cast(DougaClient, NeverCreateClient()), manifest_path)


def test_derived_run_key_changes_when_asset_content_changes() -> None:
    manifest = {"manifest_version": 1, "project": {"name": "Draft"}}

    first = _manifest_hash(manifest, {"image": "a" * 64})
    second = _manifest_hash(manifest, {"image": "b" * 64})

    assert first != second
