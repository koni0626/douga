from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ApplicationError, NotFoundError
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
class AssistantTurn:
    run: AssistantRun
    user_message: AssistantMessage
    assistant_message: AssistantMessage


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
        existing = await self.repository.list_threads(project_id, user_id)
        if existing:
            return existing[0]
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

    async def send_message(
        self, project_id: UUID, thread_id: UUID, user_id: UUID, content: str
    ) -> AssistantTurn:
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
            status="running",
            model=self.settings.openai_assistant_model,
            base_revision_number=project.current_revision_number,
            usage_json={},
            started_at=datetime.now(UTC),
        )
        await self.repository.add_message(user_message)
        await self.repository.add_run(run)
        await self.repository.mark_thread_updated(thread)
        await self.uow.commit()

        history = await self.repository.list_messages(
            thread.id, user_id, limit=self.settings.assistant_history_limit
        )
        instructions = self._instructions(project.content_locale)
        try:
            result = await self.provider.respond(
                [
                    AssistantProviderMessage(role=item.role, content=item.content)
                    for item in history
                    if item.role in {"user", "assistant"}
                ],
                instructions=instructions,
            )
        except Exception as error:
            run.status = "failed"
            run.error_code = "ASSISTANT_PROVIDER_FAILED"
            run.finished_at = datetime.now(UTC)
            await self.uow.commit()
            raise ApplicationError(
                "ASSISTANT_UNAVAILABLE", "errors.assistantUnavailable", 503
            ) from error

        assistant_message = AssistantMessage(
            thread_id=thread.id,
            user_id=user_id,
            role="assistant",
            content=result.content,
            provider_item_id=result.response_id,
        )
        await self.repository.add_message(assistant_message)
        run.status = "completed"
        run.provider_response_id = result.response_id
        run.usage_json = result.usage or {}
        run.finished_at = datetime.now(UTC)
        await self.repository.mark_thread_updated(thread)
        await self.uow.commit()
        return AssistantTurn(run, user_message, assistant_message)

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
