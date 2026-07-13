from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from douga.core.errors import ApplicationError, NotFoundError
from douga.modules.assistant.controller import message_response
from douga.modules.assistant.models import AssistantMessage
from douga.modules.assistant.orchestrator import AssistantOrchestrator
from douga.modules.assistant.service import AssistantService
from douga.modules.projects.models import Project


@pytest.mark.asyncio
async def test_attachment_validation_scopes_asset_lookup_to_user() -> None:
    service = AssistantService(MagicMock())
    asset_id = uuid4()
    user_id = uuid4()
    get_owned = AsyncMock(return_value=SimpleNamespace(kind="image", status="ready"))
    object.__setattr__(service.assets, "get_owned", get_owned)

    result = await service._validate_image_attachments(user_id, [str(asset_id)])

    assert result == [asset_id]
    get_owned.assert_awaited_once_with(asset_id, user_id)


@pytest.mark.asyncio
async def test_attachment_validation_denies_an_unowned_asset() -> None:
    service = AssistantService(MagicMock())
    object.__setattr__(service.assets, "get_owned", AsyncMock(return_value=None))

    with pytest.raises(NotFoundError):
        await service._validate_image_attachments(uuid4(), [str(uuid4())])


@pytest.mark.asyncio
async def test_attachment_validation_rejects_non_image_asset() -> None:
    service = AssistantService(MagicMock())
    object.__setattr__(
        service.assets,
        "get_owned",
        AsyncMock(return_value=SimpleNamespace(kind="audio", status="ready")),
    )

    with pytest.raises(ApplicationError, match="ASSISTANT_ATTACHMENT_INVALID"):
        await service._validate_image_attachments(uuid4(), [str(uuid4())])


def test_message_response_restores_persisted_attachment_ids() -> None:
    attachment_id = uuid4()
    message = AssistantMessage(
        id=uuid4(),
        thread_id=uuid4(),
        user_id=uuid4(),
        role="user",
        content="edit this",
        content_json={"attachment_asset_ids": [str(attachment_id)]},
        created_at=datetime.now(UTC),
    )

    response = message_response(message)

    assert response.attachment_asset_ids == [attachment_id]


def test_attachment_instructions_identify_sources_without_encoding_intent() -> None:
    asset_id = "00000000-0000-0000-0000-000000000001"
    project = Project(content_locale="ja")

    instructions = AssistantOrchestrator._instructions(project, (asset_id,))

    assert asset_id in instructions
    assert "edit_image_asset" in instructions
    assert "fixed words or phrases" in instructions
