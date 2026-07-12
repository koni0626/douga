from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.api_tokens.models import ApiToken
from douga.modules.auth.models import User


class ApiTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, token: ApiToken) -> None:
        self.session.add(token)
        await self.session.flush()

    async def list_owned(self, user_id: UUID) -> list[ApiToken]:
        result = await self.session.scalars(
            select(ApiToken).where(ApiToken.user_id == user_id).order_by(ApiToken.created_at.desc())
        )
        return list(result)

    async def get_owned(self, token_id: UUID, user_id: UUID) -> ApiToken | None:
        result = await self.session.scalars(
            select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == user_id)
        )
        return result.one_or_none()

    async def get_active_with_user(self, token_hash: str) -> tuple[ApiToken, User] | None:
        now = datetime.now(UTC)
        statement = (
            select(ApiToken, User)
            .join(User, User.id == ApiToken.user_id)
            .where(
                ApiToken.token_hash == token_hash,
                ApiToken.revoked_at.is_(None),
                (ApiToken.expires_at.is_(None) | (ApiToken.expires_at > now)),
                User.status == "active",
            )
        )
        row = (await self.session.execute(statement)).one_or_none()
        return None if row is None else (row[0], row[1])

    async def revoke(self, token_id: UUID, user_id: UUID) -> bool:
        token = await self.get_owned(token_id, user_id)
        if token is None or token.revoked_at is not None:
            return False
        token.revoked_at = datetime.now(UTC)
        await self.session.flush()
        return True

    async def touch_last_used(self, token_id: UUID) -> None:
        now = datetime.now(UTC)
        await self.session.execute(
            update(ApiToken)
            .where(
                ApiToken.id == token_id,
                (
                    ApiToken.last_used_at.is_(None)
                    | (ApiToken.last_used_at < now - timedelta(minutes=15))
                ),
            )
            .values(last_used_at=now)
        )
