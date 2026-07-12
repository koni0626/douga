from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ConflictError, NotFoundError
from douga.db.session import session_factory
from douga.db.unit_of_work import UnitOfWork
from douga.integrations.openai_responses import AssistantProvider, build_assistant_provider
from douga.modules.assistant.models import (
    AssistantMessage,
    AssistantRun,
    AssistantThread,
    AssistantToolCall,
)
from douga.modules.assistant.orchestrator import AssistantOrchestrator
from douga.modules.assistant.repository import AssistantRepository
from douga.modules.projects.models import Project
from douga.modules.projects.repository import ProjectRepository
from douga.modules.projects.service import ProjectService


@dataclass(frozen=True, slots=True)
class AssistantThreadDetail:
    thread: AssistantThread
    messages: list[AssistantMessage]
    runs: list[AssistantRun]
    tool_calls: list[AssistantToolCall]


@dataclass(frozen=True, slots=True)
class AssistantRunStarted:
    run: AssistantRun
    user_message: AssistantMessage


@dataclass(frozen=True, slots=True)
class AssistantUndoResult:
    run_id: UUID
    revision_number: int
    lock_version: int


class AssistantService:
    def __init__(self, session: AsyncSession, provider: AssistantProvider | None = None) -> None:
        self.session = session
        self.repository = AssistantRepository(session)
        self.projects = ProjectRepository(session)
        self.provider = provider or build_assistant_provider()
        self.uow = UnitOfWork(session)
        self.settings = get_settings()

    async def _owned_project(self, project_id: UUID, user_id: UUID) -> Project:
        project = await self.projects.get_owned(project_id, user_id)
        if project is None:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        return project

    async def list_threads(self, project_id: UUID, user_id: UUID) -> list[AssistantThread]:
        await self._owned_project(project_id, user_id)
        return await self.repository.list_threads(project_id, user_id)

    async def create_thread(
        self, project_id: UUID, user_id: UUID, title: str | None
    ) -> AssistantThread:
        await self._owned_project(project_id, user_id)
        thread = AssistantThread(
            project_id=project_id,
            user_id=user_id,
            title=title or "AI Assistant",
            status="active",
        )
        await self.repository.add_thread(thread)
        await self.uow.commit()
        return thread

    async def get_thread(
        self, project_id: UUID, thread_id: UUID, user_id: UUID
    ) -> AssistantThreadDetail:
        await self._owned_project(project_id, user_id)
        thread = await self.repository.get_thread(thread_id, project_id, user_id)
        if thread is None:
            raise NotFoundError("ASSISTANT_THREAD_NOT_FOUND", "errors.assistantThreadNotFound")
        messages = await self.repository.list_messages(thread_id, user_id)
        runs = await self.repository.list_runs(thread_id, user_id)
        tool_calls = await self.repository.list_thread_tool_calls(thread_id, user_id)
        return AssistantThreadDetail(
            thread=thread, messages=messages, runs=runs, tool_calls=tool_calls
        )

    async def start_run(
        self,
        project_id: UUID,
        thread_id: UUID,
        user_id: UUID,
        content: str,
        context: dict[str, object] | None = None,
    ) -> AssistantRunStarted:
        project = await self._owned_project(project_id, user_id)
        thread = await self.repository.get_thread(thread_id, project_id, user_id)
        if thread is None:
            raise NotFoundError("ASSISTANT_THREAD_NOT_FOUND", "errors.assistantThreadNotFound")
        if await self.repository.get_active_run(thread.id, user_id) is not None:
            raise ConflictError("ASSISTANT_RUN_ACTIVE", "errors.assistantRunActive")

        user_message = AssistantMessage(
            thread_id=thread.id, user_id=user_id, role="user", content=content
        )
        run = AssistantRun(
            thread_id=thread.id,
            user_id=user_id,
            project_id=project_id,
            status="queued",
            model=self.settings.openai_assistant_model,
            base_revision_number=project.current_revision_number,
            context_json=context or {},
            usage_json={},
        )
        await self.repository.add_message(user_message)
        await self.repository.add_run(run)
        await self.repository.add_event(
            run,
            "run.queued",
            {"run_id": str(run.id), "message_id": str(user_message.id)},
        )
        await self.repository.mark_thread_updated(thread)
        await self.uow.commit()
        return AssistantRunStarted(run, user_message)

    async def process_run(self, run_id: UUID) -> None:
        await AssistantOrchestrator(self.session, self.provider, self.settings).process(run_id)

    async def get_run(self, project_id: UUID, run_id: UUID, user_id: UUID) -> AssistantRun:
        await self._owned_project(project_id, user_id)
        run = await self.repository.get_run(run_id, project_id, user_id)
        if run is None:
            raise NotFoundError("ASSISTANT_RUN_NOT_FOUND", "errors.assistantRunNotFound")
        return run

    async def cancel_run(self, project_id: UUID, run_id: UUID, user_id: UUID) -> AssistantRun:
        run = await self.get_run(project_id, run_id, user_id)
        if run.status not in {"queued", "running", "waiting_approval"}:
            raise ConflictError(
                "ASSISTANT_RUN_NOT_CANCELLABLE", "errors.assistantRunNotCancellable"
            )
        run.status = "cancelled"
        run.finished_at = datetime.now(UTC)
        await self.repository.add_event(
            run, "run.cancelled", {"run_id": str(run.id), "status": run.status}
        )
        for call in await self.repository.list_tool_calls(run.id, user_id):
            if call.status in {"requested", "waiting_approval", "running"}:
                call.status = "cancelled"
                call.finished_at = datetime.now(UTC)
        await self.uow.commit()
        return run

    async def approve_tool_call(
        self, project_id: UUID, call_id: UUID, user_id: UUID
    ) -> AssistantRun:
        await self._owned_project(project_id, user_id)
        call = await self.repository.get_tool_call(call_id, project_id, user_id)
        if call is None:
            raise NotFoundError("ASSISTANT_TOOL_CALL_NOT_FOUND", "errors.assistantToolCallNotFound")
        run = await self.get_run(project_id, call.run_id, user_id)
        if call.status != "waiting_approval" or run.status != "waiting_approval":
            raise ConflictError(
                "ASSISTANT_TOOL_CALL_NOT_WAITING", "errors.assistantToolCallNotWaiting"
            )
        call.status = "requested"
        call.approved_at = datetime.now(UTC)
        run.status = "queued"
        await self.repository.add_event(
            run,
            "tool.approved",
            {"call_id": str(call.id), "tool_name": call.tool_name},
        )
        await self.uow.commit()
        return run

    async def reject_tool_call(
        self, project_id: UUID, call_id: UUID, user_id: UUID
    ) -> AssistantRun:
        await self._owned_project(project_id, user_id)
        call = await self.repository.get_tool_call(call_id, project_id, user_id)
        if call is None:
            raise NotFoundError("ASSISTANT_TOOL_CALL_NOT_FOUND", "errors.assistantToolCallNotFound")
        run = await self.get_run(project_id, call.run_id, user_id)
        if call.status != "waiting_approval" or run.status != "waiting_approval":
            raise ConflictError(
                "ASSISTANT_TOOL_CALL_NOT_WAITING", "errors.assistantToolCallNotWaiting"
            )
        call.status = "cancelled"
        call.result_json = {"error": {"code": "USER_REJECTED"}}
        call.finished_at = datetime.now(UTC)
        run.status = "queued"
        await self.repository.add_event(
            run,
            "tool.rejected",
            {"call_id": str(call.id), "tool_name": call.tool_name},
        )
        await self.uow.commit()
        return run

    async def undo_run(self, project_id: UUID, run_id: UUID, user_id: UUID) -> AssistantUndoResult:
        run = await self.get_run(project_id, run_id, user_id)
        if run.result_revision_number is None:
            raise ConflictError("ASSISTANT_RUN_HAS_NO_CHANGES", "errors.assistantRunHasNoChanges")
        if run.undo_revision_number is not None:
            raise ConflictError("ASSISTANT_RUN_ALREADY_UNDONE", "errors.assistantRunAlreadyUndone")
        project = await self._owned_project(project_id, user_id)
        if project.current_revision_number != run.result_revision_number:
            raise ConflictError("ASSISTANT_UNDO_CONFLICT", "errors.assistantUndoConflict")
        base_revision = await self.projects.get_latest_revision(
            project_id, user_id, run.base_revision_number
        )
        if base_revision is None:
            raise NotFoundError("PROJECT_REVISION_NOT_FOUND", "errors.projectNotFound")
        restored = await ProjectService(self.session).save_revision(
            project_id,
            user_id,
            project.lock_version,
            deepcopy(base_revision.document),
            f"undo assistant run {run.id}",
        )
        await self.repository.add_event(
            run,
            "run.undo_completed",
            {
                "run_id": str(run.id),
                "restored_from_revision": run.base_revision_number,
                "revision_number": restored.project.current_revision_number,
            },
        )
        run.undo_revision_number = restored.project.current_revision_number
        await self.uow.commit()
        return AssistantUndoResult(
            run_id=run.id,
            revision_number=restored.project.current_revision_number,
            lock_version=restored.project.lock_version,
        )


async def process_assistant_run(run_id: UUID) -> None:
    async with session_factory() as session:
        await AssistantService(session).process_run(run_id)
