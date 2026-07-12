from typing import Any

from douga.modules.assistant.tools.animation_tools import animation_tool_definitions
from douga.modules.assistant.tools.asset_tools import asset_tool_definitions
from douga.modules.assistant.tools.creative_tools import creative_tool_definitions
from douga.modules.assistant.tools.project_read_tools import project_read_tool_definitions
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
        + project_read_tool_definitions()
        + timeline_tool_definitions()
    )
    for definition in definitions:
        assert_strict_objects(definition.parameters, definition.parameters)


def test_high_cost_and_destructive_tools_require_approval() -> None:
    image = {item.name: item for item in asset_tool_definitions()}["generate_image"]
    delete = {item.name: item for item in timeline_tool_definitions()}["delete_clip"]

    assert image.requires_approval({"quality": "high"})
    assert not image.requires_approval({"quality": "medium"})
    assert delete.requires_approval({"clip_id": "00000000-0000-0000-0000-000000000000"})
