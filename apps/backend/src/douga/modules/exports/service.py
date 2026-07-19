import asyncio
import json
import logging
from copy import deepcopy
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
from douga.modules.exports.render_process import run_render_process
from douga.modules.exports.repository import ExportRepository
from douga.modules.exports.runtime import calculate_export_timeout_seconds
from douga.modules.exports.schemas import ExportResponse
from douga.modules.jobs.models import Job
from douga.modules.jobs.repository import JobRepository
from douga.modules.projects.models import Project, ProjectAsset, ProjectRevision
from douga.modules.projects.repository import ProjectRepository

logger = logging.getLogger(__name__)
REPOSITORY_ROOT = Path(__file__).resolve().parents[6]


def scale_project_document(
    document: dict[str, object], target_width: int, target_height: int
) -> None:
    video = document["video"]
    if not isinstance(video, dict):
        raise ValueError("Project video settings are invalid")
    source_width = float(video["width"])
    source_height = float(video["height"])
    scale_x = target_width / source_width
    scale_y = target_height / source_height
    scale_text = min(scale_x, scale_y)
    video["width"] = target_width
    video["height"] = target_height

    caption_style = document.get("caption_style")
    if isinstance(caption_style, dict):
        _scale_transform(caption_style, scale_x, scale_y)
        for field in ("padding", "font_size", "border_radius"):
            if field in caption_style:
                caption_style[field] = float(caption_style[field]) * scale_text

    scenes = document.get("scenes")
    if not isinstance(scenes, list):
        return
    for scene in scenes:
        if not isinstance(scene, dict) or not isinstance(scene.get("layers"), list):
            continue
        for layer in scene["layers"]:
            if not isinstance(layer, dict):
                continue
            _scale_transform(layer, scale_x, scale_y)
            if "font_size" in layer:
                layer["font_size"] = float(layer["font_size"]) * scale_text
            keyframes = layer.get("keyframes")
            if isinstance(keyframes, list):
                for keyframe in keyframes:
                    if isinstance(keyframe, dict):
                        _scale_transform(keyframe, scale_x, scale_y)


def _scale_transform(value: dict[str, object], scale_x: float, scale_y: float) -> None:
    for field, factor in (
        ("x", scale_x),
        ("y", scale_y),
        ("width", scale_x),
        ("height", scale_y),
    ):
        if field in value:
            current = value[field]
            if not isinstance(current, int | float) or isinstance(current, bool):
                raise ValueError(f"Project transform field {field} is invalid")
            value[field] = current * factor


def build_render_image_files(
    assets: dict[UUID, Asset], storage: LocalStorage
) -> dict[str, dict[str, str]]:
    """Build renderer-only file references without embedding image bytes in JSON."""
    result: dict[str, dict[str, str]] = {}
    for asset in assets.values():
        if asset.kind != "image" or not asset.storage_key:
            continue
        result[str(asset.id)] = {
            "path": str(storage.require_path(asset.storage_key)),
            "mime_type": asset.mime_type or "application/octet-stream",
        }
    return result


class ExportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.exports = ExportRepository(session)
        self.jobs = JobRepository(session)
        self.projects = ProjectRepository(session)
        self.uow = UnitOfWork(session)

    async def create(
        self,
        project_id: UUID,
        user_id: UUID,
        *,
        kind: str = "export",
        range_start_ms: int | None = None,
        range_end_ms: int | None = None,
        revision_number: int | None = None,
        width: int | None = None,
        height: int | None = None,
        fps: int | None = None,
        filename: str | None = None,
    ) -> ExportResponse:
        settings = get_settings()
        if await self.jobs.recent_count(user_id, "export") >= settings.export_limit_per_hour:
            raise ApplicationError("EXPORT_QUOTA_EXCEEDED", "errors.exportQuotaExceeded", 429)
        active_limit = (
            settings.max_concurrent_previews
            if kind == "preview"
            else settings.max_concurrent_exports
        )
        if await self.exports.active_count(user_id, kind) >= active_limit:
            raise ApplicationError("EXPORT_CONCURRENCY_EXCEEDED", "errors.rateLimited", 429)
        project = await self.projects.get_owned(project_id, user_id)
        if project is None:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        revision = await self.projects.get_latest_revision(
            project.id, user_id, revision_number or project.current_revision_number
        )
        if revision is None:
            raise ConflictError("PROJECT_REVISION_MISSING", "errors.exportFailed")
        video = revision.document["video"]
        duration_ms = int(video.get("duration_ms") or 5_000)
        if kind == "preview":
            start_ms = int(range_start_ms or 0)
            end_ms = int(range_end_ms or min(duration_ms, start_ms + 15_000))
            if start_ms < 0 or end_ms <= start_ms or end_ms > duration_ms:
                raise ApplicationError("PREVIEW_RANGE_INVALID", "errors.previewRangeInvalid", 422)
            if end_ms - start_ms > 15_000:
                raise ApplicationError("PREVIEW_RANGE_TOO_LONG", "errors.previewRangeTooLong", 422)
        else:
            start_ms = None
            end_ms = None
        job = Job(user_id=user_id, kind="export", payload={})
        await self.jobs.add(job)
        export = Export(
            user_id=user_id,
            project_id=project.id,
            project_revision_id=revision.id,
            job_id=job.id,
            name=(
                f"{project.name}-preview.mp4"
                if kind == "preview"
                else filename or f"{project.name}.mp4"
            ),
            kind=kind,
            range_start_ms=start_ms,
            range_end_ms=end_ms,
            width=width or int(video["width"]),
            height=height or int(video["height"]),
            fps=fps or round(float(video["fps"])),
        )
        await self.exports.add(export)
        job.payload = {"export_id": str(export.id)}
        await self.uow.commit()
        return self._response(export, job)

    async def get(self, export_id: UUID, user_id: UUID) -> ExportResponse:
        row = await self._owned(export_id, user_id)
        return self._response(*row)

    async def get_preview(
        self, project_id: UUID, preview_id: UUID, user_id: UUID
    ) -> ExportResponse:
        export, job = await self._owned(preview_id, user_id)
        if export.kind != "preview" or export.project_id != project_id:
            raise NotFoundError("PREVIEW_NOT_FOUND", "errors.previewNotFound")
        return self._response(export, job)

    async def preview_content_path(
        self, project_id: UUID, preview_id: UUID, user_id: UUID
    ) -> tuple[Path, str, str]:
        await self.get_preview(project_id, preview_id, user_id)
        return await self.content_path(preview_id, user_id)

    async def list(
        self, user_id: UUID, *, kind: str | None = "export", limit: int, offset: int
    ) -> tuple[list[ExportResponse], int]:
        rows, total = await self.exports.list_owned(user_id, kind=kind, limit=limit, offset=offset)
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
            kind=export.kind,
            range_start_ms=export.range_start_ms,
            range_end_ms=export.range_end_ms,
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
    document = deepcopy(revision.document)
    scale_project_document(document, export.width, export.height)
    document["video"]["fps"] = export.fps
    image_files = build_render_image_files(assets, storage)
    audio_inputs: list[dict[str, object]] = []
    range_start_ms = export.range_start_ms or 0
    range_end_ms = export.range_end_ms
    for track in revision.document.get("audio_tracks", []):
        try:
            asset = assets[UUID(track["asset_id"])]
        except KeyError, ValueError:
            continue
        track_start_ms = int(track.get("start_ms", 0))
        track_duration_ms = int(track.get("duration_ms") or asset.duration_ms or 0)
        track_end_ms = track_start_ms + track_duration_ms
        if range_end_ms is not None and (
            track_end_ms <= range_start_ms or track_start_ms >= range_end_ms
        ):
            continue
        if asset.kind == "audio" and asset.storage_key:
            clipped_start_ms = max(track_start_ms, range_start_ms)
            clipped_end_ms = min(track_end_ms, range_end_ms or track_end_ms)
            audio_inputs.append(
                {
                    "path": str(storage.require_path(asset.storage_key)),
                    "volume": float(track.get("volume", 1)),
                    "start_ms": max(0, track_start_ms - range_start_ms),
                    "duration_ms": clipped_end_ms - clipped_start_ms,
                    "trim_start_ms": int(track.get("trim_start_ms", 0))
                    + max(0, range_start_ms - track_start_ms),
                    "fade_in_ms": int(track.get("fade_in_ms", 0)),
                    "fade_out_ms": int(track.get("fade_out_ms", 0)),
                    "loop": bool(track.get("loop", False)),
                }
            )
    storage_key = f"users/{export.user_id}/exports/{export.id}/{export.name}"
    export.storage_key = storage_key
    return {
        "project": document,
        "image_files": image_files,
        "audio_inputs": audio_inputs,
        "output_path": str(storage.path_for(storage_key)),
        "ffmpeg_path": settings.ffmpeg_path,
        "range_start_ms": export.range_start_ms,
        "range_end_ms": export.range_end_ms,
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

            async def update_progress(progress: int) -> None:
                current = await jobs.get(job_id)
                if current is None or current.status != "running" or progress < current.progress:
                    return
                if progress > current.progress:
                    current.progress = progress
                current.heartbeat_at = datetime.now(UTC)
                await session.commit()

            timeout_seconds = calculate_export_timeout_seconds(
                input_data,
                minimum_timeout_seconds=settings.export_timeout_seconds,
            )
            process_result = await run_render_process(
                [
                    "node",
                    str(root / "scripts" / "render-project.mjs"),
                    str(input_path),
                ],
                cwd=root,
                timeout_seconds=timeout_seconds,
                on_progress=update_progress,
            )
            render_result = json.loads(process_result.stdout)

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
