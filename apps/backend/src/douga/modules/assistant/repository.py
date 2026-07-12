from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.assistant.models import (
    AssistantMessage,
    AssistantRun,
    AssistantRunEvent,
    AssistantThread,
    AssistantToolCall,
)


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

    async def add_tool_call(self, call: AssistantToolCall) -> None:
        self.session.add(call)
        await self.session.flush()

    async def list_tool_calls(self, run_id: UUID, user_id: UUID) -> list[AssistantToolCall]:
        return list(
            await self.session.scalars(
                select(AssistantToolCall)
                .where(
                    AssistantToolCall.run_id == run_id,
                    AssistantToolCall.user_id == user_id,
                )
                .order_by(AssistantToolCall.created_at)
            )
        )

    async def get_run(self, run_id: UUID, project_id: UUID, user_id: UUID) -> AssistantRun | None:
        return (
            await self.session.scalars(
                select(AssistantRun).where(
                    AssistantRun.id == run_id,
                    AssistantRun.project_id == project_id,
                    AssistantRun.user_id == user_id,
                )
            )
        ).one_or_none()

    async def get_run_internal(self, run_id: UUID) -> AssistantRun | None:
        return (
            await self.session.scalars(select(AssistantRun).where(AssistantRun.id == run_id))
        ).one_or_none()

    async def add_event(
        self, run: AssistantRun, event_type: str, data: dict[str, object]
    ) -> AssistantRunEvent:
        maximum = await self.session.scalar(
            select(func.max(AssistantRunEvent.sequence)).where(AssistantRunEvent.run_id == run.id)
        )
        event = AssistantRunEvent(
            run_id=run.id,
            user_id=run.user_id,
            sequence=int(maximum or 0) + 1,
            event_type=event_type,
            data=data,
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_events(
        self, run_id: UUID, user_id: UUID, *, after: int
    ) -> list[AssistantRunEvent]:
        return list(
            await self.session.scalars(
                select(AssistantRunEvent)
                .where(
                    AssistantRunEvent.run_id == run_id,
                    AssistantRunEvent.user_id == user_id,
                    AssistantRunEvent.sequence > after,
                )
                .order_by(AssistantRunEvent.sequence)
            )
        )

    async def mark_thread_updated(self, thread: AssistantThread) -> None:
        thread.updated_at = datetime.now(UTC)
        await self.session.flush()
