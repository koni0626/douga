import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ApplicationError, NotFoundError
from douga.db.session import session_factory
from douga.db.unit_of_work import UnitOfWork
from douga.integrations.openai_images import ImageQuality, ImageSize, build_image_provider
from douga.modules.assets.models import Asset
from douga.modules.assets.repository import AssetRepository
from douga.modules.assets.storage import LocalStorage
from douga.modules.image_generations.models import ImageGenerationRequest
from douga.modules.image_generations.repository import ImageGenerationRepository
from douga.modules.image_generations.schemas import ImageGenerationResponse
from douga.modules.jobs.models import Job
from douga.modules.jobs.repository import JobRepository

logger = logging.getLogger(__name__)


class ImageGenerationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.requests = ImageGenerationRepository(session)
        self.jobs = JobRepository(session)
        self.uow = UnitOfWork(session)
        self.settings = get_settings()

    async def create(
        self, user_id: UUID, *, prompt: str, quality: ImageQuality, size: ImageSize
    ) -> ImageGenerationResponse:
        if (
            await self.jobs.recent_count(user_id, "image_generation")
            >= self.settings.image_generation_limit_per_hour
        ):
            raise ApplicationError("IMAGE_QUOTA_EXCEEDED", "errors.imageQuotaExceeded", 429)
        job = Job(user_id=user_id, kind="image_generation", payload={})
        await self.jobs.add(job)
        request = ImageGenerationRequest(
            user_id=user_id,
            job_id=job.id,
            prompt=prompt.strip(),
            model=self.settings.openai_image_model,
            quality=quality,
            size=size,
        )
        await self.requests.add(request)
        job.payload = {"request_id": str(request.id)}
        await self.uow.commit()
        return self._response(request, job)

    async def get(self, request_id: UUID, user_id: UUID) -> ImageGenerationResponse:
        row = await self.requests.get_owned(request_id, user_id)
        if row is None:
            raise NotFoundError("IMAGE_GENERATION_NOT_FOUND", "errors.imageGenerationNotFound")
        return self._response(*row)

    async def list(
        self, user_id: UUID, *, limit: int, offset: int
    ) -> tuple[list[ImageGenerationResponse], int]:
        rows, total = await self.requests.list_owned(user_id, limit=limit, offset=offset)
        return [self._response(*row) for row in rows], total

    @staticmethod
    def _response(request: ImageGenerationRequest, job: Job) -> ImageGenerationResponse:
        return ImageGenerationResponse(
            id=request.id,
            job_id=job.id,
            prompt=request.prompt,
            model=request.model,
            quality=request.quality,
            size=request.size,
            status=job.status,
            progress=job.progress,
            output_asset_id=request.output_asset_id,
            error_code=job.error_code,
            created_at=request.created_at,
        )


async def process_image_generation_job(job_id: UUID) -> None:
    settings = get_settings()
    async with session_factory() as session:
        jobs = JobRepository(session)
        job = await jobs.claim(job_id)
        if job is None:
            return
        await session.commit()

    try:
        async with session_factory() as session:
            requests = ImageGenerationRepository(session)
            jobs = JobRepository(session)
            request = await requests.get_by_job(job_id)
            if request is None:
                raise RuntimeError("Image generation request is missing")
            provider = build_image_provider(settings)
            generated = await provider.generate(
                prompt=request.prompt,
                quality=request.quality,  # type: ignore[arg-type]
                size=request.size,  # type: ignore[arg-type]
            )
            asset_id = uuid4()
            storage_key = f"users/{request.user_id}/assets/{asset_id}/generated.png"
            storage = LocalStorage(settings.local_storage_path, settings.max_upload_bytes)
            size_bytes, digest = await storage.write_bytes(storage_key, generated.content)
            width, height = (int(value) for value in request.size.split("x"))
            asset = Asset(
                id=asset_id,
                user_id=request.user_id,
                scope="private",
                kind="image",
                source="generated",
                status="ready",
                name=request.prompt[:255],
                storage_key=storage_key,
                mime_type=generated.mime_type,
                size_bytes=size_bytes,
                sha256=digest,
                width=width,
                height=height,
                asset_metadata={"model": request.model, "request_id": str(request.id)},
            )
            await AssetRepository(session).add(asset)
            request.output_asset_id = asset.id
            job = await jobs.get(job_id)
            if job is None:
                raise RuntimeError("Job is missing")
            job.status = "succeeded"
            job.progress = 100
            job.finished_at = datetime.now(UTC)
            await session.commit()
    except Exception as error:
        logger.exception("image generation job failed", extra={"job_id": str(job_id)})
        async with session_factory() as session:
            job = await JobRepository(session).get(job_id)
            if job is not None:
                job.status = "failed"
                job.error_code = "IMAGE_GENERATION_FAILED"
                job.error_message = str(error)[:500]
                job.finished_at = datetime.now(UTC)
                await session.commit()
