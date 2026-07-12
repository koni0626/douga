from typing import Any

from douga.modules.assistant.tools.creative_tools import creative_tool_definitions


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
    for definition in creative_tool_definitions():
        assert_strict_objects(definition.parameters, definition.parameters)
