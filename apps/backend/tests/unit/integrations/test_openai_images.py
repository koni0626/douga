import base64
from io import BytesIO
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from douga.integrations.openai_images import FakeImageProvider, OpenAIImageProvider
from PIL import Image


def source_image() -> bytes:
    output = BytesIO()
    Image.new("RGB", (320, 180), "#ff0000").save(output, format="PNG")
    return output.getvalue()


@pytest.mark.asyncio
async def test_fake_image_provider_edits_source_image() -> None:
    result = await FakeImageProvider().edit(
        image=source_image(),
        mime_type="image/png",
        prompt="make the sky blue",
        quality="low",
        size="1024x1024",
    )

    with Image.open(BytesIO(result.content)) as edited:
        assert edited.size == (1024, 1024)
    assert result.mime_type == "image/png"


@pytest.mark.asyncio
async def test_openai_image_provider_uses_image_edit_endpoint() -> None:
    encoded = base64.b64encode(source_image()).decode()
    edit = AsyncMock(return_value=SimpleNamespace(data=[SimpleNamespace(b64_json=encoded)]))
    provider = OpenAIImageProvider.__new__(OpenAIImageProvider)
    provider.client = cast(Any, SimpleNamespace(images=SimpleNamespace(edit=edit)))
    provider.model = "gpt-image-2"

    result = await provider.edit(
        image=source_image(),
        mime_type="image/png",
        prompt="make the sky blue",
        quality="medium",
        size="1536x1024",
    )

    assert result.content == source_image()
    assert edit.await_args is not None
    request = edit.await_args.kwargs
    assert request["model"] == "gpt-image-2"
    assert request["prompt"] == "make the sky blue"
    assert request["quality"] == "medium"
    assert request["size"] == "1536x1024"
    assert request["image"][0] == "source-image.png"
    assert request["image"][2] == "image/png"
    assert "input_fidelity" not in request
