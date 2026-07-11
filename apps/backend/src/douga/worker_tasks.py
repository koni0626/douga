import asyncio
from uuid import UUID

import dramatiq
from dramatiq.brokers.redis import RedisBroker

from douga.core.config import get_settings
from douga.modules.exports.service import process_export_job
from douga.modules.image_generations.service import process_image_generation_job

dramatiq.set_broker(RedisBroker(url=get_settings().redis_url))  # type: ignore[no-untyped-call]


@dramatiq.actor(max_retries=2, min_backoff=5000, time_limit=900_000)
def run_image_generation(job_id: str) -> None:
    asyncio.run(process_image_generation_job(UUID(job_id)))


@dramatiq.actor(max_retries=1, min_backoff=10_000, time_limit=3_600_000)
def run_export(job_id: str) -> None:
    asyncio.run(process_export_job(UUID(job_id)))
