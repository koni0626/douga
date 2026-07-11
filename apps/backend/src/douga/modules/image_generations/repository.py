from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.image_generations.models import ImageGenerationRequest
from douga.modules.jobs.models import Job


class ImageGenerationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, request: ImageGenerationRequest) -> None:
        self.session.add(request)
        await self.session.flush()

    async def get_by_job(self, job_id: UUID) -> ImageGenerationRequest | None:
        return (
            await self.session.scalars(
                select(ImageGenerationRequest).where(ImageGenerationRequest.job_id == job_id)
            )
        ).one_or_none()

    async def get_owned(
        self, request_id: UUID, user_id: UUID
    ) -> tuple[ImageGenerationRequest, Job] | None:
        row = (
            await self.session.execute(
                select(ImageGenerationRequest, Job)
                .join(Job, Job.id == ImageGenerationRequest.job_id)
                .where(
                    ImageGenerationRequest.id == request_id,
                    ImageGenerationRequest.user_id == user_id,
                    Job.user_id == user_id,
                )
            )
        ).one_or_none()
        return (row[0], row[1]) if row else None

    async def list_owned(
        self, user_id: UUID, *, limit: int, offset: int
    ) -> tuple[list[tuple[ImageGenerationRequest, Job]], int]:
        condition = ImageGenerationRequest.user_id == user_id
        total = int(
            await self.session.scalar(
                select(func.count(ImageGenerationRequest.id)).where(condition)
            )
            or 0
        )
        rows = await self.session.execute(
            select(ImageGenerationRequest, Job)
            .join(Job, Job.id == ImageGenerationRequest.job_id)
            .where(condition, Job.user_id == user_id)
            .order_by(ImageGenerationRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [(request, job) for request, job in rows], total
