from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.assistant.models import CreativeDocument


class CreativeDocumentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_latest(self, project_id: UUID, user_id: UUID) -> list[CreativeDocument]:
        latest_versions = (
            select(
                CreativeDocument.kind,
                func.max(CreativeDocument.version).label("latest_version"),
            )
            .where(
                CreativeDocument.project_id == project_id,
                CreativeDocument.user_id == user_id,
            )
            .group_by(CreativeDocument.kind)
            .subquery()
        )
        result = await self.session.scalars(
            select(CreativeDocument)
            .join(
                latest_versions,
                (CreativeDocument.kind == latest_versions.c.kind)
                & (CreativeDocument.version == latest_versions.c.latest_version),
            )
            .where(
                CreativeDocument.project_id == project_id,
                CreativeDocument.user_id == user_id,
            )
            .order_by(CreativeDocument.kind)
        )
        return list(result)

    async def get_latest_kind(
        self, project_id: UUID, user_id: UUID, kind: str
    ) -> CreativeDocument | None:
        return (
            await self.session.scalars(
                select(CreativeDocument)
                .where(
                    CreativeDocument.project_id == project_id,
                    CreativeDocument.user_id == user_id,
                    CreativeDocument.kind == kind,
                )
                .order_by(
                    (CreativeDocument.status == "approved").desc(),
                    CreativeDocument.version.desc(),
                )
                .limit(1)
            )
        ).one_or_none()

    async def list_approved(self, project_id: UUID, user_id: UUID) -> list[CreativeDocument]:
        return list(
            await self.session.scalars(
                select(CreativeDocument)
                .where(
                    CreativeDocument.project_id == project_id,
                    CreativeDocument.user_id == user_id,
                    CreativeDocument.status == "approved",
                )
                .order_by(CreativeDocument.kind)
            )
        )

    async def get_owned(
        self, document_id: UUID, project_id: UUID, user_id: UUID
    ) -> CreativeDocument | None:
        return (
            await self.session.scalars(
                select(CreativeDocument).where(
                    CreativeDocument.id == document_id,
                    CreativeDocument.project_id == project_id,
                    CreativeDocument.user_id == user_id,
                )
            )
        ).one_or_none()

    async def next_version(self, project_id: UUID, user_id: UUID, kind: str) -> int:
        current = await self.session.scalar(
            select(func.max(CreativeDocument.version)).where(
                CreativeDocument.project_id == project_id,
                CreativeDocument.user_id == user_id,
                CreativeDocument.kind == kind,
            )
        )
        return int(current or 0) + 1

    async def supersede_approved(self, project_id: UUID, user_id: UUID, kind: str) -> None:
        await self.session.execute(
            update(CreativeDocument)
            .where(
                CreativeDocument.project_id == project_id,
                CreativeDocument.user_id == user_id,
                CreativeDocument.kind == kind,
                CreativeDocument.status == "approved",
            )
            .values(status="superseded")
        )

    async def add(self, document: CreativeDocument) -> None:
        self.session.add(document)
        await self.session.flush()
