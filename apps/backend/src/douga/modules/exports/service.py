import asyncio
import base64
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import aiofiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ApplicationError, ConflictError, NotFoundError
from douga.db.session import session_factory
from douga.db.unit_of_work import UnitOfWork
from douga.modules.assets.models import Asset
from douga.modules.assets.storage import LocalStorage
from douga.modules.exports.models import Export
from douga.modules.exports.repository import ExportRepository
from douga.modules.exports.schemas import ExportResponse
from douga.modules.jobs.models import Job
from douga.modules.jobs.repository import JobRepository
from douga.modules.projects.models import Project, ProjectAsset, ProjectRevision
from douga.modules.projects.repository import ProjectRepository

logger = logging.getLogger(__name__)
REPOSITORY_ROOT = Path(__file__).resolve().parents[6]


class ExportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.exports = ExportRepository(session)
        self.jobs = JobRepository(session)
        self.projects = ProjectRepository(session)
        self.uow = UnitOfWork(session)

    async def create(self, project_id: UUID, user_id: UUID) -> ExportResponse:
        if await self.jobs.recent_count(user_id, "export") >= get_settings().export_limit_per_hour:
            raise ApplicationError("EXPORT_QUOTA_EXCEEDED", "errors.exportQuotaExceeded", 429)
        project = await self.projects.get_owned(project_id, user_id)
        if project is None:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        revision = await self.projects.get_latest_revision(
            project.id, user_id, project.current_revision_number
        )
        if revision is None:
            raise ConflictError("PROJECT_REVISION_MISSING", "errors.exportFailed")
        video = revision.document["video"]
        job = Job(user_id=user_id, kind="export", payload={})
        await self.jobs.add(job)
        export = Export(
            user_id=user_id,
            project_id=project.id,
            project_revision_id=revision.id,
            job_id=job.id,
            name=f"{project.name}.mp4",
            width=int(video["width"]),
            height=int(video["height"]),
            fps=round(float(video["fps"])),
        )
        await self.exports.add(export)
        job.payload = {"export_id": str(export.id)}
        await self.uow.commit()
        return self._response(export, job)

    async def get(self, export_id: UUID, user_id: UUID) -> ExportResponse:
        row = await self._owned(export_id, user_id)
        return self._response(*row)

    async def list(
        self, user_id: UUID, *, limit: int, offset: int
    ) -> tuple[list[ExportResponse], int]:
        rows, total = await self.exports.list_owned(user_id, limit=limit, offset=offset)
        return [self._response(*row) for row in rows], total

    async def content_path(self, export_id: UUID, user_id: UUID) -> tuple[Path, str, str]:
        export, job = await self._owned(export_id, user_id)
        if job.status != "succeeded" or not export.storage_key:
            raise NotFoundError("EXPORT_CONTENT_NOT_FOUND", "errors.exportNotFound")
        settings = get_settings()
        path = LocalStorage(settings.local_storage_path, settings.max_upload_bytes).require_path(
            export.storage_key
        )
        return path, export.mime_type or "video/mp4", export.name

    async def cancel(self, export_id: UUID, user_id: UUID) -> None:
        _, job = await self._owned(export_id, user_id)
        if job.status not in {"queued", "running"}:
            raise ConflictError("EXPORT_NOT_CANCELLABLE", "errors.exportNotCancellable")
        job.status = "cancelled"
        job.finished_at = datetime.now(UTC)
        await self.uow.commit()

    async def _owned(self, export_id: UUID, user_id: UUID) -> tuple[Export, Job]:
        row = await self.exports.get_owned(export_id, user_id)
        if row is None:
            raise NotFoundError("EXPORT_NOT_FOUND", "errors.exportNotFound")
        return row

    @staticmethod
    def _response(export: Export, job: Job) -> ExportResponse:
        return ExportResponse(
            id=export.id,
            project_id=export.project_id,
            project_revision_id=export.project_revision_id,
            job_id=job.id,
            name=export.name,
            status=job.status,
            progress=job.progress,
            width=export.width,
            height=export.height,
            fps=export.fps,
            size_bytes=export.size_bytes,
            duration_ms=export.duration_ms,
            error_code=job.error_code,
            created_at=export.created_at,
        )


async def _render_input(session: AsyncSession, export: Export) -> dict[str, object]:
    settings = get_settings()
    revision = await session.get(ProjectRevision, export.project_revision_id)
    project = await session.get(Project, export.project_id)
    if revision is None or project is None or project.user_id != export.user_id:
        raise RuntimeError("Export source revision is missing")
    rows = await session.execute(
        select(Asset)
        .join(ProjectAsset, ProjectAsset.asset_id == Asset.id)
        .where(
            ProjectAsset.project_revision_id == revision.id,
            ProjectAsset.user_id == export.user_id,
            Asset.user_id == export.user_id,
            Asset.status == "ready",
            Asset.deleted_at.is_(None),
        )
    )
    assets = {asset.id: asset for asset in rows.scalars().unique()}
    storage = LocalStorage(settings.local_storage_path, settings.max_upload_bytes)
    data_urls: dict[str, str] = {}
    for asset in assets.values():
        if asset.kind == "image" and asset.storage_key:
            content = await asyncio.to_thread(storage.require_path(asset.storage_key).read_bytes)
            data_urls[str(asset.id)] = (
                f"data:{asset.mime_type or 'image/png'};base64,{base64.b64encode(content).decode()}"
            )
    audio_inputs: list[dict[str, object]] = []
    for track in revision.document.get("audio_tracks", []):
        try:
            asset = assets[UUID(track["asset_id"])]
        except KeyError, ValueError:
            continue
        if asset.kind == "audio" and asset.storage_key:
            audio_inputs.append(
                {
                    "path": str(storage.require_path(asset.storage_key)),
                    "volume": float(track.get("volume", 1)),
                    "start_ms": int(track.get("start_ms", 0)),
                    "loop": bool(track.get("loop", False)),
                }
            )
    storage_key = f"users/{export.user_id}/exports/{export.id}/{export.name}"
    export.storage_key = storage_key
    return {
        "project": revision.document,
        "asset_data_urls": data_urls,
        "audio_inputs": audio_inputs,
        "output_path": str(storage.path_for(storage_key)),
        "ffmpeg_path": settings.ffmpeg_path,
    }


async def process_export_job(job_id: UUID) -> None:
    settings = get_settings()
    output_path: Path | None = None
    try:
        async with session_factory() as session:
            job = await JobRepository(session).claim(job_id)
            if job is None:
                return
            await session.commit()
        async with session_factory() as session:
            jobs = JobRepository(session)
            export = await ExportRepository(session).get_by_job(job_id)
            if export is None:
                raise RuntimeError("Export record is missing")
            input_data = await _render_input(session, export)
            output_path = Path(str(input_data["output_path"]))
            await asyncio.to_thread(output_path.parent.mkdir, parents=True, exist_ok=True)
            root = REPOSITORY_ROOT
            job_dir = root / ".local-data" / "render-jobs" / str(job_id)
            await asyncio.to_thread(job_dir.mkdir, parents=True, exist_ok=True)
            input_path = job_dir / "input.json"
            async with aiofiles.open(input_path, "w", encoding="utf-8") as stream:
                await stream.write(json.dumps(input_data, ensure_ascii=False))
            job = await jobs.get(job_id)
            if job is None or job.status == "cancelled":
                return
            job.progress = 5
            job.heartbeat_at = datetime.now(UTC)
            await session.commit()

            process = await asyncio.create_subprocess_exec(
                "node",
                str(root / "scripts" / "render-project.mjs"),
                str(input_path),
                cwd=root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=settings.export_timeout_seconds
                )
            except TimeoutError:
                process.kill()
                await process.wait()
                raise RuntimeError("Export timed out") from None
            if process.returncode != 0:
                raise RuntimeError(stderr.decode(errors="replace")[-500:])
            render_result = json.loads(stdout)

            job = await jobs.get(job_id)
            if job is None or job.status == "cancelled":
                if output_path.exists():
                    await asyncio.to_thread(output_path.unlink)
                return
            export.size_bytes = output_path.stat().st_size
            export.duration_ms = int(render_result["duration_ms"])
            export.mime_type = "video/mp4"
            export.codec = "h264"
            job.status = "succeeded"
            job.progress = 100
            job.finished_at = datetime.now(UTC)
            await session.commit()
    except Exception as error:
        logger.exception("export job failed", extra={"job_id": str(job_id)})
        if output_path and output_path.exists():
            await asyncio.to_thread(output_path.unlink)
        async with session_factory() as session:
            job = await JobRepository(session).get(job_id)
            if job is not None and job.status != "cancelled":
                job.status = "failed"
                job.error_code = "EXPORT_FAILED"
                job.error_message = str(error)[:500]
                job.finished_at = datetime.now(UTC)
                await session.commit()
