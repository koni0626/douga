from datetime import UTC, datetime
from typing import Any
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

    async def list_conversation_messages(
        self, thread_id: UUID, user_id: UUID
    ) -> list[AssistantMessage]:
        result = await self.session.scalars(
            select(AssistantMessage)
            .where(
                AssistantMessage.thread_id == thread_id,
                AssistantMessage.user_id == user_id,
                AssistantMessage.role.in_(("user", "assistant")),
            )
            .order_by(AssistantMessage.created_at.asc(), AssistantMessage.id.asc())
        )
        return list(result)

    async def get_latest_system_summary(
        self, thread_id: UUID, user_id: UUID
    ) -> AssistantMessage | None:
        result = await self.session.scalars(
            select(AssistantMessage)
            .where(
                AssistantMessage.thread_id == thread_id,
                AssistantMessage.user_id == user_id,
                AssistantMessage.role == "system_summary",
            )
            .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
            .limit(1)
        )
        return result.one_or_none()

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

    async def list_thread_tool_calls(
        self, thread_id: UUID, user_id: UUID, *, limit: int = 100
    ) -> list[AssistantToolCall]:
        return list(
            await self.session.scalars(
                select(AssistantToolCall)
                .join(AssistantRun, AssistantRun.id == AssistantToolCall.run_id)
                .where(
                    AssistantRun.thread_id == thread_id,
                    AssistantRun.user_id == user_id,
                    AssistantToolCall.user_id == user_id,
                )
                .order_by(AssistantToolCall.created_at.desc())
                .limit(limit)
            )
        )

    async def get_tool_call(
        self, call_id: UUID, project_id: UUID, user_id: UUID
    ) -> AssistantToolCall | None:
        return (
            await self.session.scalars(
                select(AssistantToolCall)
                .join(AssistantRun, AssistantRun.id == AssistantToolCall.run_id)
                .where(
                    AssistantToolCall.id == call_id,
                    AssistantToolCall.user_id == user_id,
                    AssistantRun.project_id == project_id,
                    AssistantRun.user_id == user_id,
                )
            )
        ).one_or_none()

    async def get_resumable_tool_call(
        self, run_id: UUID, user_id: UUID
    ) -> AssistantToolCall | None:
        return (
            await self.session.scalars(
                select(AssistantToolCall)
                .where(
                    AssistantToolCall.run_id == run_id,
                    AssistantToolCall.user_id == user_id,
                    AssistantToolCall.approval_required.is_(True),
                    AssistantToolCall.status.in_(("requested", "cancelled")),
                )
                .order_by(AssistantToolCall.created_at.desc())
                .limit(1)
            )
        ).one_or_none()

    async def list_runs(
        self, thread_id: UUID, user_id: UUID, *, limit: int = 50
    ) -> list[AssistantRun]:
        return list(
            await self.session.scalars(
                select(AssistantRun)
                .where(
                    AssistantRun.thread_id == thread_id,
                    AssistantRun.user_id == user_id,
                )
                .order_by(AssistantRun.created_at.desc())
                .limit(limit)
            )
        )

    async def get_active_run(self, thread_id: UUID, user_id: UUID) -> AssistantRun | None:
        return (
            await self.session.scalars(
                select(AssistantRun)
                .where(
                    AssistantRun.thread_id == thread_id,
                    AssistantRun.user_id == user_id,
                    AssistantRun.status.in_(("queued", "running", "waiting_approval")),
                )
                .order_by(AssistantRun.created_at.desc())
                .limit(1)
            )
        ).one_or_none()

    async def recent_run_count(self, user_id: UUID, since: datetime) -> int:
        return int(
            await self.session.scalar(
                select(func.count())
                .select_from(AssistantRun)
                .where(AssistantRun.user_id == user_id, AssistantRun.created_at >= since)
            )
            or 0
        )

    async def recent_usage_records(
        self, user_id: UUID, since: datetime, *, exclude_run_id: UUID | None = None
    ) -> list[dict[str, Any]]:
        statement = select(AssistantRun.usage_json).where(
            AssistantRun.user_id == user_id, AssistantRun.created_at >= since
        )
        if exclude_run_id is not None:
            statement = statement.where(AssistantRun.id != exclude_run_id)
        rows = await self.session.scalars(statement)
        return [dict(usage or {}) for usage in rows]

    async def list_project_runs(
        self, project_id: UUID, user_id: UUID, *, limit: int = 500
    ) -> list[AssistantRun]:
        return list(
            await self.session.scalars(
                select(AssistantRun)
                .where(
                    AssistantRun.project_id == project_id,
                    AssistantRun.user_id == user_id,
                )
                .order_by(AssistantRun.created_at.desc())
                .limit(limit)
            )
        )

    async def list_project_tool_calls(
        self, project_id: UUID, user_id: UUID, *, limit: int = 500
    ) -> list[AssistantToolCall]:
        return list(
            await self.session.scalars(
                select(AssistantToolCall)
                .join(AssistantRun, AssistantRun.id == AssistantToolCall.run_id)
                .where(
                    AssistantRun.project_id == project_id,
                    AssistantRun.user_id == user_id,
                    AssistantToolCall.user_id == user_id,
                )
                .order_by(AssistantToolCall.created_at.desc())
                .limit(limit)
            )
        )

    async def list_project_events(
        self, project_id: UUID, user_id: UUID, *, limit: int = 5_000
    ) -> list[AssistantRunEvent]:
        return list(
            await self.session.scalars(
                select(AssistantRunEvent)
                .join(AssistantRun, AssistantRun.id == AssistantRunEvent.run_id)
                .where(
                    AssistantRun.project_id == project_id,
                    AssistantRun.user_id == user_id,
                    AssistantRunEvent.user_id == user_id,
                )
                .order_by(AssistantRunEvent.created_at.desc())
                .limit(limit)
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
