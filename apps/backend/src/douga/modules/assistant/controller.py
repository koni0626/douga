import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session, session_factory
from douga.modules.assistant.models import (
    AssistantMessage,
    AssistantRun,
    AssistantThread,
    AssistantToolCall,
)
from douga.modules.assistant.repository import AssistantRepository
from douga.modules.assistant.schemas import (
    AssistantMessageCreateRequest,
    AssistantMessageResponse,
    AssistantRunResponse,
    AssistantRunStartedResponse,
    AssistantThreadCreateRequest,
    AssistantThreadDetailResponse,
    AssistantThreadListResponse,
    AssistantThreadResponse,
    AssistantToolCallResponse,
    AssistantUndoResponse,
)
from douga.modules.assistant.service import AssistantService, process_assistant_run
from douga.modules.auth.dependencies import csrf_protected_auth, current_auth
from douga.modules.auth.service import AuthContext

router = APIRouter(prefix="/projects/{project_id}/assistant", tags=["assistant"])


def thread_response(thread: AssistantThread) -> AssistantThreadResponse:
    return AssistantThreadResponse.model_validate(thread, from_attributes=True)


def message_response(message: AssistantMessage) -> AssistantMessageResponse:
    return AssistantMessageResponse.model_validate(message, from_attributes=True)


def run_response(run: AssistantRun) -> AssistantRunResponse:
    return AssistantRunResponse.model_validate(run, from_attributes=True)


def tool_call_response(call: AssistantToolCall) -> AssistantToolCallResponse:
    return AssistantToolCallResponse.model_validate(call, from_attributes=True)


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
        runs=[run_response(item) for item in detail.runs],
        tool_calls=[tool_call_response(item) for item in detail.tool_calls],
    )


@router.post(
    "/threads/{thread_id}/messages",
    response_model=AssistantRunStartedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def send_message(
    project_id: UUID,
    thread_id: UUID,
    payload: AssistantMessageCreateRequest,
    background_tasks: BackgroundTasks,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantRunStartedResponse:
    result = await AssistantService(session).start_run(
        project_id,
        thread_id,
        context.user.id,
        payload.content,
        payload.context.model_dump(mode="json") if payload.context else None,
    )
    background_tasks.add_task(process_assistant_run, result.run.id)
    return AssistantRunStartedResponse(
        run_id=result.run.id,
        status=result.run.status,
        user_message=message_response(result.user_message),
    )


@router.get("/runs/{run_id}", response_model=AssistantRunResponse)
async def get_run(
    project_id: UUID,
    run_id: UUID,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantRunResponse:
    return run_response(
        await AssistantService(session).get_run(project_id, run_id, context.user.id)
    )


@router.post("/runs/{run_id}/cancel", response_model=AssistantRunResponse)
async def cancel_run(
    project_id: UUID,
    run_id: UUID,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantRunResponse:
    return run_response(
        await AssistantService(session).cancel_run(project_id, run_id, context.user.id)
    )


@router.post("/runs/{run_id}/undo", response_model=AssistantUndoResponse)
async def undo_run(
    project_id: UUID,
    run_id: UUID,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantUndoResponse:
    result = await AssistantService(session).undo_run(project_id, run_id, context.user.id)
    return AssistantUndoResponse(
        run_id=result.run_id,
        revision_number=result.revision_number,
        lock_version=result.lock_version,
    )


@router.post("/tool-calls/{call_id}/approve", response_model=AssistantRunResponse)
async def approve_tool_call(
    project_id: UUID,
    call_id: UUID,
    background_tasks: BackgroundTasks,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantRunResponse:
    run = await AssistantService(session).approve_tool_call(project_id, call_id, context.user.id)
    background_tasks.add_task(process_assistant_run, run.id)
    return run_response(run)


@router.post("/tool-calls/{call_id}/reject", response_model=AssistantRunResponse)
async def reject_tool_call(
    project_id: UUID,
    call_id: UUID,
    background_tasks: BackgroundTasks,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssistantRunResponse:
    run = await AssistantService(session).reject_tool_call(project_id, call_id, context.user.id)
    background_tasks.add_task(process_assistant_run, run.id)
    return run_response(run)


@router.get("/runs/{run_id}/events")
async def stream_run_events(
    project_id: UUID,
    run_id: UUID,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
    after: Annotated[int, Query(ge=0)] = 0,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    await AssistantService(session).get_run(project_id, run_id, context.user.id)

    try:
        resume_after = max(after, int(last_event_id or 0))
    except ValueError:
        resume_after = after

    async def events() -> AsyncIterator[str]:
        cursor = resume_after
        idle_count = 0
        while True:
            async with session_factory() as event_session:
                repository = AssistantRepository(event_session)
                items = await repository.list_events(run_id, context.user.id, after=cursor)
                run = await repository.get_run(run_id, project_id, context.user.id)
            for item in items:
                cursor = item.sequence
                yield (
                    f"id: {item.sequence}\n"
                    f"event: {item.event_type}\n"
                    f"data: {json.dumps(item.data, ensure_ascii=False)}\n\n"
                )
            if run is None or (run.status in {"completed", "failed", "cancelled"} and not items):
                return
            idle_count += 1
            if idle_count % 40 == 0:
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.25)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
