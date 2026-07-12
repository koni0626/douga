from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.assistant.models import AssistantMessage, AssistantRun, AssistantThread


class AssistantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_threads(self, project_id: UUID, user_id: UUID) -> list[AssistantThread]:
        result = await self.session.scalars(
            select(AssistantThread)
            .where(
                AssistantThread.project_id == project_id,
                AssistantThread.user_id == user_id,
                AssistantThread.status == "active",
            )
            .order_by(AssistantThread.updated_at.desc())
        )
        return list(result)

    async def get_thread(
        self, thread_id: UUID, project_id: UUID, user_id: UUID
    ) -> AssistantThread | None:
        result = await self.session.scalars(
            select(AssistantThread).where(
                AssistantThread.id == thread_id,
                AssistantThread.project_id == project_id,
                AssistantThread.user_id == user_id,
            )
        )
        return result.one_or_none()

    async def list_messages(
        self, thread_id: UUID, user_id: UUID, *, limit: int | None = None
    ) -> list[AssistantMessage]:
        statement = (
            select(AssistantMessage)
            .where(AssistantMessage.thread_id == thread_id, AssistantMessage.user_id == user_id)
            .order_by(AssistantMessage.created_at.asc())
        )
        if limit is not None:
            statement = (
                select(AssistantMessage)
                .where(
                    AssistantMessage.id.in_(
                        select(AssistantMessage.id)
                        .where(
                            AssistantMessage.thread_id == thread_id,
                            AssistantMessage.user_id == user_id,
                        )
                        .order_by(AssistantMessage.created_at.desc())
                        .limit(limit)
                    )
                )
                .order_by(AssistantMessage.created_at.asc())
            )
        return list(await self.session.scalars(statement))

    async def add_thread(self, thread: AssistantThread) -> None:
        self.session.add(thread)
        await self.session.flush()

    async def add_message(self, message: AssistantMessage) -> None:
        self.session.add(message)
        await self.session.flush()

    async def add_run(self, run: AssistantRun) -> None:
        self.session.add(run)
        await self.session.flush()

    async def mark_thread_updated(self, thread: AssistantThread) -> None:
        thread.updated_at = datetime.now(UTC)
        await self.session.flush()
