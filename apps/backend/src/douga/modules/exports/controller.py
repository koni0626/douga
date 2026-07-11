from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.auth.dependencies import csrf_protected_auth, current_auth
from douga.modules.auth.service import AuthContext
from douga.modules.exports.schemas import ExportCreateRequest, ExportListResponse, ExportResponse
from douga.modules.exports.service import ExportService
from douga.modules.jobs.dispatcher import dispatch_export_job

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("", response_model=ExportResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_export(
    payload: ExportCreateRequest,
    background_tasks: BackgroundTasks,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExportResponse:
    result = await ExportService(session).create(payload.project_id, context.user.id)
    dispatch_export_job(background_tasks, result.job_id)
    return result


@router.get("", response_model=ExportListResponse)
async def list_exports(
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ExportListResponse:
    items, total = await ExportService(session).list(context.user.id, limit=limit, offset=offset)
    return ExportListResponse(items=items, total=total)


@router.get("/{export_id}", response_model=ExportResponse)
async def get_export(
    export_id: UUID,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExportResponse:
    return await ExportService(session).get(export_id, context.user.id)


@router.get("/{export_id}/content", response_class=FileResponse)
async def get_export_content(
    export_id: UUID,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    path, media_type, filename = await ExportService(session).content_path(
        export_id, context.user.id
    )
    return FileResponse(path, media_type=media_type, filename=filename)


@router.delete("/{export_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_export(
    export_id: UUID,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await ExportService(session).cancel(export_id, context.user.id)
