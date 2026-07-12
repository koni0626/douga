from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.automation.models import ApiIdempotencyRecord, AutomationOperation


class AutomationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_idempotency(
        self, user_id: UUID, method: str, path: str, key: str
    ) -> ApiIdempotencyRecord | None:
        result = await self.session.scalars(
            select(ApiIdempotencyRecord).where(
                ApiIdempotencyRecord.user_id == user_id,
                ApiIdempotencyRecord.method == method,
                ApiIdempotencyRecord.path == path,
                ApiIdempotencyRecord.key == key,
                ApiIdempotencyRecord.expires_at > datetime.now(UTC),
            )
        )
        return result.one_or_none()

    async def get_idempotency_by_id(self, record_id: UUID) -> ApiIdempotencyRecord | None:
        return await self.session.get(ApiIdempotencyRecord, record_id)

    async def delete_expired_idempotency(
        self, user_id: UUID, method: str, path: str, key: str
    ) -> None:
        await self.session.execute(
            delete(ApiIdempotencyRecord).where(
                ApiIdempotencyRecord.user_id == user_id,
                ApiIdempotencyRecord.method == method,
                ApiIdempotencyRecord.path == path,
                ApiIdempotencyRecord.key == key,
                ApiIdempotencyRecord.expires_at <= datetime.now(UTC),
            )
        )

    async def delete_idempotency(self, record_id: UUID) -> None:
        await self.session.execute(
            delete(ApiIdempotencyRecord).where(ApiIdempotencyRecord.id == record_id)
        )

    async def add_idempotency(self, record: ApiIdempotencyRecord) -> None:
        self.session.add(record)
        await self.session.flush()

    async def add_operation(self, operation: AutomationOperation) -> None:
        self.session.add(operation)
        await self.session.flush()

    async def get_operation_owned(
        self, operation_id: UUID, user_id: UUID
    ) -> AutomationOperation | None:
        result = await self.session.scalars(
            select(AutomationOperation).where(
                AutomationOperation.id == operation_id,
                AutomationOperation.user_id == user_id,
            )
        )
        return result.one_or_none()
