from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.auth.models import User, UserSession, UserSettings


class AuthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_user_by_email(self, email_normalized: str) -> User | None:
        result = await self.session.scalars(
            select(User).where(User.email_normalized == email_normalized)
        )
        return result.one_or_none()

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        return await self.session.get(User, user_id)

    async def add_user(self, user: User, settings: UserSettings) -> None:
        self.session.add_all((user, settings))
        await self.session.flush()

    async def add_session(self, user_session: UserSession) -> None:
        self.session.add(user_session)
        await self.session.flush()

    async def get_active_session(self, token_hash: str) -> tuple[UserSession, User] | None:
        statement = (
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(
                UserSession.token_hash == token_hash,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > datetime.now(UTC),
                User.status == "active",
            )
        )
        row = (await self.session.execute(statement)).one_or_none()
        return None if row is None else (row[0], row[1])

    async def revoke_session(self, session_id: UUID) -> None:
        await self.session.execute(
            update(UserSession)
            .where(UserSession.id == session_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    async def get_settings(self, user_id: UUID) -> UserSettings | None:
        return await self.session.get(UserSettings, user_id)
