from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.auth.dependencies import scoped_auth, scoped_write_auth
from douga.modules.auth.service import AuthContext
from douga.modules.projects.schemas import (
    ProjectCreateRequest,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectSummaryResponse,
    ProjectUpdateRequest,
    ProjectValidateRequest,
    ProjectValidateResponse,
    RevisionCreateRequest,
)
from douga.modules.projects.service import ProjectDetail, ProjectService, ProjectSummary
from douga.modules.projects.validation_service import ProjectValidationService

router = APIRouter(prefix="/projects", tags=["projects"])


def summary_response(summary: ProjectSummary) -> ProjectSummaryResponse:
    return ProjectSummaryResponse.model_validate(summary, from_attributes=True)


def detail_response(detail: ProjectDetail) -> ProjectDetailResponse:
    return ProjectDetailResponse(project=summary_response(detail.project), document=detail.document)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    context: Annotated[AuthContext, Depends(scoped_auth("projects:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    project_status: Annotated[
        Literal["draft", "editing", "rendered", "archived"] | None,
        Query(alias="status"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ProjectListResponse:
    result = await ProjectService(session).list_projects(
        context.user.id,
        search=search,
        status=project_status,
        limit=limit,
        offset=offset,
    )
    return ProjectListResponse(
        items=[summary_response(project) for project in result.items], total=result.total
    )


@router.post("", response_model=ProjectDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreateRequest,
    context: Annotated[AuthContext, Depends(scoped_write_auth("projects:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectDetailResponse:
    result = await ProjectService(session).create_project(
        context.user.id, payload.name, payload.content_locale
    )
    return detail_response(result)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_auth("projects:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectDetailResponse:
    return detail_response(await ProjectService(session).get_project(project_id, context.user.id))


@router.patch("/{project_id}", response_model=ProjectSummaryResponse)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdateRequest,
    context: Annotated[AuthContext, Depends(scoped_write_auth("projects:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectSummaryResponse:
    result = await ProjectService(session).update_project(
        project_id,
        context.user.id,
        name=payload.name,
        status=payload.status,
    )
    return summary_response(result)


@router.post("/{project_id}/revisions", response_model=ProjectDetailResponse)
async def save_revision(
    project_id: UUID,
    payload: RevisionCreateRequest,
    context: Annotated[AuthContext, Depends(scoped_write_auth("projects:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectDetailResponse:
    result = await ProjectService(session).save_revision(
        project_id,
        context.user.id,
        payload.lock_version,
        payload.document,
        payload.change_summary,
    )
    return detail_response(result)


@router.post("/{project_id}/validate", response_model=ProjectValidateResponse)
async def validate_project_document(
    project_id: UUID,
    payload: ProjectValidateRequest,
    context: Annotated[AuthContext, Depends(scoped_write_auth("projects:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectValidateResponse:
    result = await ProjectValidationService(session).validate(
        project_id, context.user.id, payload.document
    )
    return ProjectValidateResponse(
        valid=result.valid,
        errors=result.errors,
        warnings=result.warnings,
        estimated_duration_ms=result.estimated_duration_ms,
    )


@router.post("/{project_id}/duplicate", response_model=ProjectDetailResponse)
async def duplicate_project(
    project_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_write_auth("projects:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProjectDetailResponse:
    return detail_response(
        await ProjectService(session).duplicate_project(project_id, context.user.id)
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_write_auth("projects:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await ProjectService(session).delete_project(project_id, context.user.id)
