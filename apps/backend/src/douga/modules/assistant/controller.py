from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.assistant.models import AssistantMessage, AssistantThread
from douga.modules.assistant.schemas import (
    AssistantMessageCreateRequest,
    AssistantMessageResponse,
    AssistantThreadCreateRequest,
    AssistantThreadDetailResponse,
    AssistantThreadListResponse,
    AssistantThreadResponse,
    AssistantTurnResponse,
)
from douga.modules.assistant.service import AssistantService
from douga.modules.auth.dependencies import csrf_protected_auth, current_auth
from douga.modules.auth.service import AuthContext

router = APIRouter(prefix="/projects/{project_id}/assistant", tags=["assistant"])


def thread_response(thread: AssistantThread) -> AssistantThreadResponse:
    return AssistantThreadResponse.model_validate(thread, from_attributes=True)


def message_response(message: AssistantMessage) -> AssistantMessageResponse:
    return AssistantMessageResponse.model_validate(message, from_attributes=True)


@router.get("/threads", response_model=AssistantThreadListResponse)
async def list_threads(
    project_id: UUID,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantThreadListResponse:
    items = await AssistantService(session).list_threads(project_id, context.user.id)
    return AssistantThreadListResponse(items=[thread_response(item) for item in items])


@router.post(
    "/threads", response_model=AssistantThreadResponse, status_code=status.HTTP_201_CREATED
)
async def create_thread(
    project_id: UUID,
    payload: AssistantThreadCreateRequest,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantThreadResponse:
    return thread_response(
        await AssistantService(session).create_thread(project_id, context.user.id, payload.title)
    )


@router.get("/threads/{thread_id}", response_model=AssistantThreadDetailResponse)
async def get_thread(
    project_id: UUID,
    thread_id: UUID,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantThreadDetailResponse:
    detail = await AssistantService(session).get_thread(project_id, thread_id, context.user.id)
    return AssistantThreadDetailResponse(
        thread=thread_response(detail.thread),
        messages=[message_response(item) for item in detail.messages],
    )


@router.post("/threads/{thread_id}/messages", response_model=AssistantTurnResponse)
async def send_message(
    project_id: UUID,
    thread_id: UUID,
    payload: AssistantMessageCreateRequest,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantTurnResponse:
    result = await AssistantService(session).send_message(
        project_id, thread_id, context.user.id, payload.content
    )
    return AssistantTurnResponse(
        run_id=result.run.id,
        status=result.run.status,
        user_message=message_response(result.user_message),
        assistant_message=message_response(result.assistant_message),
    )
