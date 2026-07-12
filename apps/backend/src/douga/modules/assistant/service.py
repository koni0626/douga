from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ApplicationError, ConflictError, NotFoundError
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
from douga.modules.exports.service import ExportService
from douga.modules.image_generations.service import ImageGenerationService
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
        since = datetime.now(UTC) - timedelta(hours=1)
        if (
            await self.repository.recent_run_count(user_id, since)
            >= self.settings.assistant_run_limit_per_hour
        ):
            raise ApplicationError(
                "ASSISTANT_RUN_QUOTA_EXCEEDED", "errors.assistantRunQuotaExceeded", 429
            )

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

    async def metrics(self, project_id: UUID, user_id: UUID) -> dict[str, object]:
        await self._owned_project(project_id, user_id)
        runs = await self.repository.list_project_runs(project_id, user_id)
        calls = await self.repository.list_project_tool_calls(project_id, user_id)
        events = await self.repository.list_project_events(project_id, user_id)
        run_statuses: dict[str, int] = {}
        tool_statuses: dict[str, int] = {}
        for run in runs:
            run_statuses[run.status] = run_statuses.get(run.status, 0) + 1
        for call in calls:
            tool_statuses[call.status] = tool_statuses.get(call.status, 0) + 1
        terminal_runs = [run for run in runs if run.status in {"completed", "failed", "cancelled"}]
        changed_runs = [run for run in runs if run.result_revision_number is not None]
        provider_events = [event for event in events if event.event_type == "provider.completed"]
        provider_durations = [
            int(event.data["duration_ms"])
            for event in provider_events
            if isinstance(event.data.get("duration_ms"), int)
        ]
        first_delta_durations = [
            int(event.data["first_delta_ms"])
            for event in provider_events
            if isinstance(event.data.get("first_delta_ms"), int)
        ]
        tool_metrics: dict[str, dict[str, int]] = {}
        for call in calls:
            item = tool_metrics.setdefault(
                call.tool_name,
                {"total": 0, "completed": 0, "failed": 0, "cancelled": 0},
            )
            item["total"] += 1
            if call.status in item:
                item[call.status] += 1
        approval_calls = [call for call in calls if call.approval_required]
        generated_asset_ids = {
            str(call.result_json["generation"]["asset_id"])
            for call in calls
            if call.tool_name == "generate_image"
            and call.result_json
            and isinstance(call.result_json.get("generation"), dict)
            and call.result_json["generation"].get("asset_id")
        }
        detail = await ProjectService(self.session).get_project(project_id, user_id)
        used_asset_ids: set[str] = set()
        for scene in detail.document.get("scenes", []):
            background = scene.get("background", {})
            if background.get("type") == "asset":
                used_asset_ids.add(str(background.get("asset_id")))
            used_asset_ids.update(
                str(layer.get("asset_id"))
                for layer in scene.get("layers", [])
                if layer.get("type") == "image" and layer.get("asset_id")
            )
        return {
            "run_count": len(runs),
            "run_statuses": run_statuses,
            "tool_call_count": len(calls),
            "tool_statuses": tool_statuses,
            "total_tokens": sum(int((run.usage_json or {}).get("total_tokens", 0)) for run in runs),
            "waiting_approval_count": sum(call.status == "waiting_approval" for call in calls),
            "run_success_rate": (
                sum(run.status == "completed" for run in terminal_runs) / len(terminal_runs)
                if terminal_runs
                else None
            ),
            "undo_rate": (
                sum(run.undo_revision_number is not None for run in changed_runs)
                / len(changed_runs)
                if changed_runs
                else None
            ),
            "approval_rate": (
                sum(call.approved_at is not None for call in approval_calls) / len(approval_calls)
                if approval_calls
                else None
            ),
            "image_adoption_rate": (
                len(generated_asset_ids & used_asset_ids) / len(generated_asset_ids)
                if generated_asset_ids
                else None
            ),
            "average_provider_duration_ms": (
                round(sum(provider_durations) / len(provider_durations))
                if provider_durations
                else None
            ),
            "average_first_delta_ms": (
                round(sum(first_delta_durations) / len(first_delta_durations))
                if first_delta_durations
                else None
            ),
            "tool_metrics": tool_metrics,
        }

    async def audit_log(
        self, project_id: UUID, user_id: UUID, *, limit: int
    ) -> list[AssistantToolCall]:
        await self._owned_project(project_id, user_id)
        return await self.repository.list_project_tool_calls(project_id, user_id, limit=limit)

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
        events = await self.repository.list_events(run.id, user_id, after=0)
        request_ids: set[UUID] = set()
        export_ids: set[UUID] = set()
        for event in events:
            if event.event_type != "tool.progress":
                continue
            try:
                if event.data.get("request_id"):
                    request_ids.add(UUID(str(event.data["request_id"])))
                if event.data.get("export_id"):
                    export_ids.add(UUID(str(event.data["export_id"])))
            except ValueError:
                continue
        for request_id in request_ids:
            try:
                await ImageGenerationService(self.session).cancel(request_id, user_id)
            except ConflictError, NotFoundError:
                pass
        for export_id in export_ids:
            try:
                await ExportService(self.session).cancel(export_id, user_id)
            except ConflictError, NotFoundError:
                pass
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
