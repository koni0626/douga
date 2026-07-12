from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ConflictError, NotFoundError
from douga.db.session import session_factory
from douga.db.unit_of_work import UnitOfWork
from douga.integrations.openai_responses import (
    AssistantProvider,
    AssistantProviderMessage,
    build_assistant_provider,
)
from douga.modules.assistant.models import AssistantMessage, AssistantRun, AssistantThread
from douga.modules.assistant.repository import AssistantRepository
from douga.modules.projects.models import Project
from douga.modules.projects.repository import ProjectRepository


@dataclass(frozen=True, slots=True)
class AssistantThreadDetail:
    thread: AssistantThread
    messages: list[AssistantMessage]


@dataclass(frozen=True, slots=True)
class AssistantRunStarted:
    run: AssistantRun
    user_message: AssistantMessage


class AssistantRunCancelled(Exception):
    """Stop an in-flight provider stream after the user cancels its run."""


class AssistantService:
    def __init__(self, session: AsyncSession, provider: AssistantProvider | None = None) -> None:
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
        return AssistantThreadDetail(thread=thread, messages=messages)

    async def start_run(
        self, project_id: UUID, thread_id: UUID, user_id: UUID, content: str
    ) -> AssistantRunStarted:
        project = await self._owned_project(project_id, user_id)
        thread = await self.repository.get_thread(thread_id, project_id, user_id)
        if thread is None:
            raise NotFoundError("ASSISTANT_THREAD_NOT_FOUND", "errors.assistantThreadNotFound")

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
        run = await self.repository.get_run_internal(run_id)
        if run is None or run.status != "queued":
            return
        run.status = "running"
        run.started_at = datetime.now(UTC)
        await self.repository.add_event(run, "run.started", {"run_id": str(run.id)})
        await self.uow.commit()

        project = await self._owned_project(run.project_id, run.user_id)
        thread = await self.repository.get_thread(run.thread_id, run.project_id, run.user_id)
        if thread is None:
            await self._fail_run(run, "ASSISTANT_THREAD_NOT_FOUND")
            return

        history = await self.repository.list_messages(
            thread.id, run.user_id, limit=self.settings.assistant_history_limit
        )
        instructions = self._instructions(project.content_locale)

        async def record_delta(delta: str) -> None:
            await self.repository.session.refresh(run)
            if run.status == "cancelled":
                raise AssistantRunCancelled
            await self.repository.add_event(run, "message.delta", {"delta": delta})
            await self.uow.commit()

        try:
            result = await self.provider.respond(
                [
                    AssistantProviderMessage(role=item.role, content=item.content)
                    for item in history
                    if item.role in {"user", "assistant"}
                ],
                instructions=instructions,
                on_delta=record_delta,
            )
        except AssistantRunCancelled:
            return
        except Exception as error:
            del error
            await self._fail_run(run, "ASSISTANT_PROVIDER_FAILED")
            return

        await self.repository.session.refresh(run)
        if run.status == "cancelled":
            return

        assistant_message = AssistantMessage(
            thread_id=thread.id,
            user_id=run.user_id,
            role="assistant",
            content=result.content,
            provider_item_id=result.response_id,
        )
        await self.repository.add_message(assistant_message)
        await self.repository.add_event(
            run,
            "message.completed",
            {
                "message": {
                    "id": str(assistant_message.id),
                    "role": assistant_message.role,
                    "content": assistant_message.content,
                    "created_at": assistant_message.created_at.isoformat(),
                }
            },
        )
        run.status = "completed"
        run.provider_response_id = result.response_id
        run.usage_json = result.usage or {}
        run.finished_at = datetime.now(UTC)
        await self.repository.add_event(
            run,
            "run.completed",
            {"run_id": str(run.id), "status": run.status},
        )
        await self.repository.mark_thread_updated(thread)
        await self.uow.commit()

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
        await self.uow.commit()
        return run

    async def _fail_run(self, run: AssistantRun, error_code: str) -> None:
        run.status = "failed"
        run.error_code = error_code
        run.finished_at = datetime.now(UTC)
        await self.repository.add_event(
            run,
            "run.failed",
            {"run_id": str(run.id), "status": run.status, "error_code": error_code},
        )
        await self.uow.commit()

    @staticmethod
    def _instructions(locale: str) -> str:
        language = "Japanese" if locale == "ja" else "English"
        return (
            "You are the collaborative video production assistant for the Douga editor. "
            f"Respond in {language}. "
            "Help the user explore ideas, plots, scripts, storyboards, and editing choices. "
            "When the user asks to think together or propose ideas, do not claim that you changed "
            "the timeline. This phase has no editing tools, so clearly describe "
            "proposed next steps. "
            "Ask only questions whose answers materially change the result."
        )


async def process_assistant_run(run_id: UUID) -> None:
    async with session_factory() as session:
        await AssistantService(session).process_run(run_id)
