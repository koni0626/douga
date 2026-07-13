from typing import Any

import pytest
from douga.core.errors import ApplicationError
from douga.modules.assistant.tools.image_edit_tools import (
    select_visible_image_layer,
    visible_image_layers,
)


def project_document() -> dict[str, Any]:
    return {
        "video": {"duration_ms": 10_000},
        "scenes": [
            {
                "layers": [
                    {
                        "id": "layer-sky",
                        "type": "image",
                        "name": "Sky",
                        "asset_id": "00000000-0000-0000-0000-000000000001",
                        "start_ms": 0,
                        "end_ms": 10_000,
                    },
                    {
                        "id": "layer-person",
                        "type": "image",
                        "name": "Person",
                        "asset_id": "00000000-0000-0000-0000-000000000002",
                        "start_ms": 5_000,
                        "end_ms": 10_000,
                    },
                    {"id": "title", "type": "text", "name": "Title"},
                ],
                "dialogues": [],
            }
        ],
    }


def test_visible_image_layers_only_returns_images_active_at_current_time() -> None:
    layers = visible_image_layers(project_document(), 2_000)

    assert [layer["name"] for layer in layers] == ["Sky"]


def test_select_visible_image_layer_uses_exact_case_insensitive_name() -> None:
    layer = select_visible_image_layer(project_document(), 7_000, " person ")

    assert layer["id"] == "layer-person"


def test_select_visible_image_layer_rejects_an_ambiguous_name() -> None:
    document = project_document()
    layers = document["scenes"][0]["layers"]
    layers[0]["name"] = "Image"
    layers[1]["name"] = "Image"

    with pytest.raises(ApplicationError, match="VISIBLE_IMAGE_LAYER_AMBIGUOUS"):
        select_visible_image_layer(document, 7_000, "Image")
