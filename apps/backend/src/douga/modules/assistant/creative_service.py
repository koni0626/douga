from copy import deepcopy
from typing import Any, cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.errors import ApplicationError, NotFoundError
from douga.db.unit_of_work import UnitOfWork
from douga.modules.assistant.creative_repository import CreativeDocumentRepository
from douga.modules.assistant.creative_schemas import CreativeKind, validate_creative_content
from douga.modules.assistant.models import CreativeDocument
from douga.modules.assistant.repository import AssistantRepository
from douga.modules.projects.repository import ProjectRepository


class CreativeDocumentService:
    def __init__(self, session: AsyncSession) -> None:
        self.repository = CreativeDocumentRepository(session)
        self.assistant_repository = AssistantRepository(session)
        self.projects = ProjectRepository(session)
        self.uow = UnitOfWork(session)

    async def _owned_project(self, project_id: UUID, user_id: UUID) -> None:
        if await self.projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")

    async def list_documents(self, project_id: UUID, user_id: UUID) -> list[CreativeDocument]:
        await self._owned_project(project_id, user_id)
        return await self.repository.list_latest(project_id, user_id)

    async def list_approved(self, project_id: UUID, user_id: UUID) -> list[CreativeDocument]:
        await self._owned_project(project_id, user_id)
        return await self.repository.list_approved(project_id, user_id)

    async def get_kind(
        self, project_id: UUID, user_id: UUID, kind: CreativeKind
    ) -> CreativeDocument:
        await self._owned_project(project_id, user_id)
        document = await self.repository.get_latest_kind(project_id, user_id, kind)
        if document is None:
            raise NotFoundError("CREATIVE_DOCUMENT_NOT_FOUND", "errors.creativeDocumentNotFound")
        return document

    async def save(
        self,
        project_id: UUID,
        user_id: UUID,
        *,
        kind: CreativeKind,
        status: str,
        content: dict[str, Any],
        source_run_id: UUID | None = None,
    ) -> CreativeDocument:
        await self._owned_project(project_id, user_id)
        if source_run_id is not None:
            run = await self.assistant_repository.get_run(source_run_id, project_id, user_id)
            if run is None:
                raise NotFoundError("ASSISTANT_RUN_NOT_FOUND", "errors.assistantRunNotFound")
        try:
            validated = validate_creative_content(kind, content)
        except ValidationError as error:
            raise ApplicationError(
                "CREATIVE_DOCUMENT_INVALID", "errors.creativeDocumentInvalid", 422
            ) from error
        document = CreativeDocument(
            project_id=project_id,
            user_id=user_id,
            kind=kind,
            status=status,
            version=await self.repository.next_version(project_id, user_id, kind),
            content=validated,
            source_run_id=source_run_id,
        )
        await self.repository.add(document)
        await self.uow.commit()
        return document

    async def adopt(self, project_id: UUID, document_id: UUID, user_id: UUID) -> CreativeDocument:
        await self._owned_project(project_id, user_id)
        source = await self.repository.get_owned(document_id, project_id, user_id)
        if source is None:
            raise NotFoundError("CREATIVE_DOCUMENT_NOT_FOUND", "errors.creativeDocumentNotFound")
        await self.repository.supersede_approved(project_id, user_id, source.kind)
        adopted = CreativeDocument(
            project_id=project_id,
            user_id=user_id,
            kind=source.kind,
            status="approved",
            version=await self.repository.next_version(project_id, user_id, source.kind),
            content=deepcopy(source.content),
            source_run_id=source.source_run_id,
        )
        await self.repository.add(adopted)
        await self.uow.commit()
        return adopted

    async def revise_status(
        self,
        project_id: UUID,
        document_id: UUID,
        user_id: UUID,
        *,
        status: str,
        source_run_id: UUID,
    ) -> CreativeDocument:
        await self._owned_project(project_id, user_id)
        source = await self.repository.get_owned(document_id, project_id, user_id)
        if source is None:
            raise NotFoundError("CREATIVE_DOCUMENT_NOT_FOUND", "errors.creativeDocumentNotFound")
        return await self.save(
            project_id,
            user_id,
            kind=cast(CreativeKind, source.kind),
            status=status,
            content=deepcopy(source.content),
            source_run_id=source_run_id,
        )
