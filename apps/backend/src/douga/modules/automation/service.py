from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.errors import ConflictError, NotFoundError
from douga.db.unit_of_work import UnitOfWork
from douga.modules.automation.models import ApiIdempotencyRecord, AutomationOperation
from douga.modules.automation.repository import AutomationRepository


@dataclass(frozen=True, slots=True)
class IdempotencyReservation:
    record_id: UUID
    replay_status: int | None = None
    replay_body: dict[str, Any] | None = None


class AutomationService:
    def __init__(self, session: AsyncSession) -> None:
        self.repository = AutomationRepository(session)
        self.uow = UnitOfWork(session)

    async def reserve(
        self, user_id: UUID, *, method: str, path: str, key: str, request_hash: str
    ) -> IdempotencyReservation:
        existing = await self.repository.get_idempotency(user_id, method, path, key)
        if existing is not None:
            return self._existing_reservation(existing, request_hash)
        await self.repository.delete_expired_idempotency(user_id, method, path, key)
        record = ApiIdempotencyRecord(
            id=uuid4(),
            user_id=user_id,
            key=key,
            method=method,
            path=path,
            request_hash=request_hash,
            state="running",
            expires_at=datetime.now(UTC) + timedelta(hours=24),
            created_at=datetime.now(UTC),
        )
        try:
            await self.repository.add_idempotency(record)
            await self.uow.commit()
        except IntegrityError:
            await self.uow.rollback()
            existing = await self.repository.get_idempotency(user_id, method, path, key)
            if existing is None:
                raise
            return self._existing_reservation(existing, request_hash)
        return IdempotencyReservation(record.id)

    async def abandon(self, record_id: UUID) -> None:
        await self.repository.delete_idempotency(record_id)
        await self.uow.commit()

    async def finalize(
        self, record_id: UUID, *, status_code: int, response_json: dict[str, Any]
    ) -> None:
        record = await self.repository.get_idempotency_by_id(record_id)
        if record is None:
            return
        record.state = "completed"
        record.status_code = status_code
        record.response_json = response_json
        await self.uow.commit()

    async def record_operation(
        self,
        *,
        user_id: UUID,
        api_token_id: UUID,
        source: str,
        external_run_id: str | None,
        operation_type: str,
        status_code: int,
        response_json: dict[str, Any],
    ) -> AutomationOperation:
        project_id, resource_type, resource_id = self._resource(response_json, operation_type)
        error = response_json.get("error")
        operation = AutomationOperation(
            user_id=user_id,
            api_token_id=api_token_id,
            source=source[:100],
            external_run_id=external_run_id[:200] if external_run_id else None,
            operation_type=operation_type[:100],
            status="completed" if status_code < 400 else "failed",
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            summary_json={"status_code": status_code},
            error_code=str(error.get("code"))[:100] if isinstance(error, dict) else None,
            created_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
        )
        await self.repository.add_operation(operation)
        await self.uow.commit()
        return operation

    async def get_operation(self, operation_id: UUID, user_id: UUID) -> AutomationOperation:
        operation = await self.repository.get_operation_owned(operation_id, user_id)
        if operation is None:
            raise NotFoundError("AUTOMATION_OPERATION_NOT_FOUND", "errors.operationNotFound")
        return operation

    @staticmethod
    def _existing_reservation(
        record: ApiIdempotencyRecord, request_hash: str
    ) -> IdempotencyReservation:
        if record.request_hash != request_hash:
            raise ConflictError("IDEMPOTENCY_CONFLICT", "errors.idempotencyConflict")
        if record.state == "running":
            raise ConflictError("IDEMPOTENCY_IN_PROGRESS", "errors.idempotencyInProgress")
        return IdempotencyReservation(
            record.id, record.status_code or 200, record.response_json or {}
        )

    @staticmethod
    def _resource(
        response: dict[str, Any], operation_type: str
    ) -> tuple[UUID | None, str | None, UUID | None]:
        project_data = response.get("project")
        if isinstance(project_data, dict):
            project_id = AutomationService._uuid(project_data.get("id"))
            return project_id, "project", project_id
        asset_data = response.get("asset")
        if isinstance(asset_data, dict):
            asset_id = AutomationService._uuid(asset_data.get("id"))
            return None, "asset", asset_id
        resource_id = AutomationService._uuid(response.get("id"))
        project_id = AutomationService._uuid(response.get("project_id"))
        resource_types = {
            "asset_upload_complete": "asset",
            "creative_document_save": "creative_document",
            "preview_create": "preview",
            "export_create": "export",
            "image_generation_create": "image_generation",
        }
        return project_id, resource_types.get(operation_type), resource_id

    @staticmethod
    def _uuid(value: object) -> UUID | None:
        try:
            return UUID(str(value)) if value else None
        except ValueError:
            return None
