from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.exports.models import Export
from douga.modules.jobs.models import Job


class ExportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, export: Export) -> None:
        self.session.add(export)
        await self.session.flush()

    async def get_by_job(self, job_id: UUID) -> Export | None:
        return (
            await self.session.scalars(select(Export).where(Export.job_id == job_id))
        ).one_or_none()

    async def get_owned(self, export_id: UUID, user_id: UUID) -> tuple[Export, Job] | None:
        row = (
            await self.session.execute(
                select(Export, Job)
                .join(Job, Job.id == Export.job_id)
                .where(Export.id == export_id, Export.user_id == user_id, Job.user_id == user_id)
            )
        ).one_or_none()
        return (row[0], row[1]) if row else None

    async def list_owned(
        self, user_id: UUID, *, kind: str | None, limit: int, offset: int
    ) -> tuple[list[tuple[Export, Job]], int]:
        filters = [Export.user_id == user_id]
        if kind is not None:
            filters.append(Export.kind == kind)
        total = int(await self.session.scalar(select(func.count(Export.id)).where(*filters)) or 0)
        rows = await self.session.execute(
            select(Export, Job)
            .join(Job, Job.id == Export.job_id)
            .where(*filters, Job.user_id == user_id)
            .order_by(Export.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [(export, job) for export, job in rows], total
