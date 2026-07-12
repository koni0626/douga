from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.auth.dependencies import scoped_auth, scoped_write_auth
from douga.modules.auth.service import AuthContext
from douga.modules.image_generations.schemas import (
    ImageGenerationCreateRequest,
    ImageGenerationListResponse,
    ImageGenerationResponse,
)
from douga.modules.image_generations.service import ImageGenerationService
from douga.modules.jobs.dispatcher import dispatch_image_job

router = APIRouter(prefix="/image-generations", tags=["image-generations"])


@router.post("", response_model=ImageGenerationResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_image_generation(
    payload: ImageGenerationCreateRequest,
    background_tasks: BackgroundTasks,
    context: Annotated[AuthContext, Depends(scoped_write_auth("image-generations:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImageGenerationResponse:
    result = await ImageGenerationService(session).create(
        context.user.id,
        prompt=payload.prompt,
        quality=payload.quality,
        size=payload.size,
    )
    dispatch_image_job(background_tasks, result.job_id)
    return result


@router.get("", response_model=ImageGenerationListResponse)
async def list_image_generations(
    context: Annotated[AuthContext, Depends(scoped_auth("image-generations:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ImageGenerationListResponse:
    items, total = await ImageGenerationService(session).list(
        context.user.id, limit=limit, offset=offset
    )
    return ImageGenerationListResponse(items=items, total=total)


@router.get("/{request_id}", response_model=ImageGenerationResponse)
async def get_image_generation(
    request_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_auth("image-generations:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImageGenerationResponse:
    return await ImageGenerationService(session).get(request_id, context.user.id)
