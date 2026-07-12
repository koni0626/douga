from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.auth.dependencies import scoped_auth, scoped_write_auth
from douga.modules.auth.service import AuthContext
from douga.modules.exports.schemas import ExportResponse, PreviewCreateRequest
from douga.modules.exports.service import ExportService
from douga.modules.jobs.dispatcher import dispatch_export_job

router = APIRouter(prefix="/projects/{project_id}/previews", tags=["previews"])


@router.post("", response_model=ExportResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_preview(
    project_id: UUID,
    payload: PreviewCreateRequest,
    background_tasks: BackgroundTasks,
    context: Annotated[AuthContext, Depends(scoped_write_auth("previews:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExportResponse:
    result = await ExportService(session).create(
        project_id,
        context.user.id,
        kind="preview",
        range_start_ms=payload.range_start_ms,
        range_end_ms=payload.range_end_ms,
        revision_number=payload.revision_number,
        width=payload.width,
        height=payload.height,
        fps=payload.fps,
    )
    dispatch_export_job(background_tasks, result.job_id)
    return result


@router.get("/{preview_id}", response_model=ExportResponse)
async def get_preview(
    project_id: UUID,
    preview_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_auth("previews:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExportResponse:
    return await ExportService(session).get_preview(project_id, preview_id, context.user.id)


@router.get("/{preview_id}/content", response_class=FileResponse)
async def get_preview_content(
    project_id: UUID,
    preview_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_auth("previews:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    path, media_type, filename = await ExportService(session).preview_content_path(
        project_id, preview_id, context.user.id
    )
    return FileResponse(path, media_type=media_type, filename=filename)
