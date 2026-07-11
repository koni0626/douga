from uuid import UUID

from douga.modules.projects.service import project_thumbnail_asset_id


def test_thumbnail_prefers_first_scene_background_asset() -> None:
    background_id = UUID("11111111-1111-1111-1111-111111111111")
    layer_id = UUID("22222222-2222-2222-2222-222222222222")
    document = {
        "scenes": [
            {
                "background": {"type": "asset", "asset_id": str(background_id)},
                "layers": [{"type": "image", "asset_id": str(layer_id)}],
            }
        ]
    }

    assert project_thumbnail_asset_id(document) == background_id


def test_thumbnail_falls_back_to_first_image_layer() -> None:
    layer_id = UUID("22222222-2222-2222-2222-222222222222")
    document = {
        "scenes": [
            {
                "background": {"type": "color", "color": "#000000"},
                "layers": [
                    {"type": "shape"},
                    {"type": "image", "asset_id": str(layer_id)},
                ],
            }
        ]
    }

    assert project_thumbnail_asset_id(document) == layer_id


def test_thumbnail_is_empty_without_images() -> None:
    document = {
        "scenes": [
            {
                "background": {"type": "color", "color": "#000000"},
                "layers": [],
            }
        ]
    }

    assert project_thumbnail_asset_id(document) is None
