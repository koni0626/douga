from typing import Any

from douga.modules.assistant.tools.animation_tools import animation_tool_definitions
from douga.modules.assistant.tools.asset_tools import asset_tool_definitions
from douga.modules.assistant.tools.creative_tools import creative_tool_definitions
from douga.modules.assistant.tools.image_edit_tools import image_edit_tool_definitions
from douga.modules.assistant.tools.output_tools import output_tool_definitions
from douga.modules.assistant.tools.project_read_tools import project_read_tool_definitions
from douga.modules.assistant.tools.speech_alignment_tools import (
    speech_alignment_tool_definitions,
)
from douga.modules.assistant.tools.speech_tools import speech_tool_definitions
from douga.modules.assistant.tools.timeline_tools import timeline_tool_definitions


def assert_strict_objects(schema: dict[str, Any], root: dict[str, Any]) -> None:
    if "$ref" in schema:
        target: Any = root
        for part in schema["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        assert_strict_objects(target, root)
        return
    if schema.get("type") == "object":
        properties = schema.get("properties", {})
        assert schema.get("additionalProperties") is False
        assert set(schema.get("required", [])) == set(properties)
        for child in properties.values():
            assert_strict_objects(child, root)
    for branch in schema.get("anyOf", []):
        assert_strict_objects(branch, root)
    if "items" in schema:
        assert_strict_objects(schema["items"], root)


def test_creative_tool_json_schemas_are_strict() -> None:
    definitions = (
        creative_tool_definitions()
        + asset_tool_definitions()
        + animation_tool_definitions()
        + image_edit_tool_definitions()
        + output_tool_definitions()
        + project_read_tool_definitions()
        + speech_tool_definitions()
        + speech_alignment_tool_definitions()
        + timeline_tool_definitions()
    )
    for definition in definitions:
        assert_strict_objects(definition.parameters, definition.parameters)


def test_high_cost_and_destructive_tools_require_approval() -> None:
    image = {item.name: item for item in asset_tool_definitions()}["generate_image"]
    image_edit = {item.name: item for item in image_edit_tool_definitions()}["edit_visible_image"]
    delete = {item.name: item for item in timeline_tool_definitions()}["delete_clip"]
    export = {item.name: item for item in output_tool_definitions()}["export_video"]

    assert image.requires_approval({"quality": "high"})
    assert not image.requires_approval({"quality": "medium"})
    assert image_edit.requires_approval({"quality": "high"})
    assert not image_edit.requires_approval({"quality": "medium"})
    assert delete.requires_approval({"clip_id": "00000000-0000-0000-0000-000000000000"})
    assert export.requires_approval({})


def test_design_tool_catalog_is_implemented() -> None:
    definitions = (
        creative_tool_definitions()
        + asset_tool_definitions()
        + animation_tool_definitions()
        + image_edit_tool_definitions()
        + project_read_tool_definitions()
        + speech_tool_definitions()
        + speech_alignment_tool_definitions()
        + timeline_tool_definitions()
        + output_tool_definitions()
    )
    names = {item.name for item in definitions}
    assert {
        "get_project_context",
        "get_timeline_summary",
        "get_clip_details",
        "list_assets",
        "inspect_frame",
        "get_creative_document",
        "save_project_brief",
        "save_plot",
        "save_script",
        "save_storyboard",
        "update_creative_status",
        "generate_image",
        "edit_image_asset",
        "edit_visible_image",
        "list_generation_status",
        "list_speech_voices",
        "generate_narration",
        "create_synced_captions_from_narration",
        "validate_narration_caption_sync",
        "add_text_clip",
        "add_caption_clip",
        "add_shape_clip",
        "add_audio_clip",
        "duplicate_audio_clip",
        "add_asset_to_timeline",
        "replace_clip_asset",
        "update_clip_timing",
        "update_clip_transform",
        "update_clip_content",
        "delete_clip",
        "extend_timeline",
        "apply_animation",
        "apply_effect",
        "clear_animation",
        "apply_camera_effect",
        "render_preview",
        "validate_timeline",
        "export_video",
    } <= names
