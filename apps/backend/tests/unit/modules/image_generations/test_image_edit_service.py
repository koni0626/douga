from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from douga.core.errors import NotFoundError
from douga.modules.image_generations.schemas import ImageGenerationResponse
from douga.modules.image_generations.service import ImageGenerationService


@pytest.mark.asyncio
async def test_create_edit_scopes_source_asset_to_authenticated_user() -> None:
    service = ImageGenerationService(MagicMock())

    with (
        patch.object(service.assets, "get_owned", AsyncMock(return_value=None)),
        pytest.raises(NotFoundError),
    ):
        await service.create_edit(
            uuid4(),
            parent_asset_id=uuid4(),
            prompt="make it blue",
            quality="low",
            size="1024x1024",
        )


@pytest.mark.asyncio
async def test_create_edit_forwards_owned_ready_image_to_generation_job() -> None:
    user_id = uuid4()
    parent_asset_id = uuid4()
    expected = cast(ImageGenerationResponse, SimpleNamespace(id=uuid4()))
    service = ImageGenerationService(MagicMock())
    get_owned = AsyncMock(return_value=SimpleNamespace(kind="image", status="ready"))
    create = AsyncMock(return_value=expected)

    with (
        patch.object(service.assets, "get_owned", get_owned),
        patch.object(service, "_create", create),
    ):
        result = await service.create_edit(
            user_id,
            parent_asset_id=parent_asset_id,
            prompt="make it blue",
            quality="medium",
            size="1536x1024",
        )

    assert result is expected
    create.assert_awaited_once_with(
        user_id,
        prompt="make it blue",
        quality="medium",
        size="1536x1024",
        parent_asset_id=parent_asset_id,
    )
