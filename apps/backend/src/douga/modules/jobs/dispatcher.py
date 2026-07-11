from uuid import UUID

from fastapi import BackgroundTasks

from douga.core.config import get_settings
from douga.modules.exports.service import process_export_job
from douga.modules.image_generations.service import process_image_generation_job


def dispatch_image_job(background_tasks: BackgroundTasks, job_id: UUID) -> None:
    if get_settings().job_dispatch_mode == "redis":
        from douga.worker_tasks import run_image_generation

        run_image_generation.send(str(job_id))
        return
    background_tasks.add_task(process_image_generation_job, job_id)


def dispatch_export_job(background_tasks: BackgroundTasks, job_id: UUID) -> None:
    if get_settings().job_dispatch_mode == "redis":
        from douga.worker_tasks import run_export

        run_export.send(str(job_id))
        return
    background_tasks.add_task(process_export_job, job_id)
