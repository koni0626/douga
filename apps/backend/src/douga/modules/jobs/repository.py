from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.jobs.models import Job


class JobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, job: Job) -> None:
        self.session.add(job)
        await self.session.flush()

    async def get(self, job_id: UUID) -> Job | None:
        return await self.session.get(Job, job_id)

    async def get_owned(self, job_id: UUID, user_id: UUID) -> Job | None:
        return (
            await self.session.scalars(select(Job).where(Job.id == job_id, Job.user_id == user_id))
        ).one_or_none()

    async def recent_count(self, user_id: UUID, kind: str, hours: int = 1) -> int:
        since = datetime.now(UTC) - timedelta(hours=hours)
        return int(
            await self.session.scalar(
                select(func.count(Job.id)).where(
                    Job.user_id == user_id, Job.kind == kind, Job.created_at >= since
                )
            )
            or 0
        )

    async def claim(self, job_id: UUID) -> Job | None:
        job = (
            await self.session.scalars(
                select(Job).where(Job.id == job_id).with_for_update(skip_locked=True)
            )
        ).one_or_none()
        if job is None or job.status != "queued":
            return None
        now = datetime.now(UTC)
        job.status = "running"
        job.progress = 1
        job.attempts += 1
        job.started_at = now
        job.heartbeat_at = now
        await self.session.flush()
        return job
