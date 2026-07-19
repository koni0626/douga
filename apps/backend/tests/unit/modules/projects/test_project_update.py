from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from douga.core.errors import NotFoundError
from douga.modules.projects.service import ProjectService


def project_record() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        name="Original title",
        status="editing",
        content_locale="ja",
        current_revision_number=2,
        lock_version=1,
        scene_count=1,
        estimated_duration_ms=5_000,
        thumbnail_asset_id=None,
        updated_at=datetime(2026, 7, 19, tzinfo=UTC),
    )


async def test_update_project_refreshes_server_generated_fields_before_response() -> None:
    project = project_record()
    refreshed_at = datetime(2026, 7, 20, tzinfo=UTC)

    async def refresh(record: SimpleNamespace) -> None:
        record.updated_at = refreshed_at

    repository = SimpleNamespace(
        get_owned=AsyncMock(return_value=project),
        refresh=AsyncMock(side_effect=refresh),
    )
    uow = SimpleNamespace(commit=AsyncMock())
    service = object.__new__(ProjectService)
    service.repository = repository
    service.uow = uow

    result = await service.update_project(
        project.id,
        project.user_id,
        name="Updated title",
        status=None,
    )

    repository.get_owned.assert_awaited_once_with(project.id, project.user_id)
    uow.commit.assert_awaited_once_with()
    repository.refresh.assert_awaited_once_with(project)
    assert result.name == "Updated title"
    assert result.updated_at == refreshed_at


async def test_update_project_hides_projects_owned_by_another_user() -> None:
    repository = SimpleNamespace(
        get_owned=AsyncMock(return_value=None),
        refresh=AsyncMock(),
    )
    uow = SimpleNamespace(commit=AsyncMock())
    service = object.__new__(ProjectService)
    service.repository = repository
    service.uow = uow

    project_id = uuid4()
    requesting_user_id = uuid4()
    with pytest.raises(NotFoundError):
        await service.update_project(
            project_id,
            requesting_user_id,
            name="Not allowed",
            status=None,
        )

    repository.get_owned.assert_awaited_once_with(project_id, requesting_user_id)
    uow.commit.assert_not_awaited()
    repository.refresh.assert_not_awaited()
