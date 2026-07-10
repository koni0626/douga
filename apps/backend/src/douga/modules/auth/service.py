from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from hashlib import sha256
from secrets import token_urlsafe
from typing import Any, Literal
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ConflictError, ForbiddenError, UnauthorizedError
from douga.db.unit_of_work import UnitOfWork
from douga.modules.auth.models import User, UserSession, UserSettings
from douga.modules.auth.passwords import DUMMY_PASSWORD_HASH, password_service
from douga.modules.auth.repository import AuthRepository

Locale = Literal["ja", "en"]


@dataclass(frozen=True, slots=True)
class UserView:
    id: UUID
    email: str
    preferred_locale: str


@dataclass(frozen=True, slots=True)
class SessionCredentials:
    token: str
    csrf_token: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class AuthResult:
    user: UserView
    credentials: SessionCredentials


@dataclass(frozen=True, slots=True)
class AuthContext:
    user: UserView
    session_id: UUID
    csrf_token_hash: str


@dataclass(frozen=True, slots=True)
class SettingsView:
    preferred_locale: str
    default_content_locale: str
    default_video_width: int
    default_video_height: int
    default_video_fps: Decimal
    default_caption_settings: dict[str, Any]


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.repository = AuthRepository(session)
        self.uow = UnitOfWork(session)
        self.settings = get_settings()

    async def register(
        self, email: str, password: str, locale: Locale, user_agent: str | None
    ) -> AuthResult:
        normalized = normalize_email(email)
        if await self.repository.get_user_by_email(normalized) is not None:
            raise ConflictError("EMAIL_ALREADY_REGISTERED", "errors.emailAlreadyRegistered")

        user_id = uuid4()
        user = User(
            id=user_id,
            email=email.strip(),
            email_normalized=normalized,
            password_hash=password_service.hash(password),
            preferred_locale=locale,
        )
        user_settings = UserSettings(user_id=user_id, default_content_locale=locale)
        try:
            await self.repository.add_user(user, user_settings)
            credentials = await self._issue_session(user.id, user_agent)
            await self.uow.commit()
        except IntegrityError as error:
            await self.uow.rollback()
            raise ConflictError(
                "EMAIL_ALREADY_REGISTERED", "errors.emailAlreadyRegistered"
            ) from error
        return AuthResult(self._user_view(user), credentials)

    async def login(self, email: str, password: str, user_agent: str | None) -> AuthResult:
        user = await self.repository.get_user_by_email(normalize_email(email))
        password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
        password_matches = password_service.verify(password_hash, password)
        if user is None or user.status != "active" or not password_matches:
            raise UnauthorizedError("INVALID_CREDENTIALS", "errors.invalidCredentials")

        user.last_login_at = datetime.now(UTC)
        credentials = await self._issue_session(user.id, user_agent)
        await self.uow.commit()
        return AuthResult(self._user_view(user), credentials)

    async def authenticate(self, token: str | None) -> AuthContext:
        if not token:
            raise UnauthorizedError()
        result = await self.repository.get_active_session(hash_token(token))
        if result is None:
            raise UnauthorizedError()
        user_session, user = result
        return AuthContext(
            user=self._user_view(user),
            session_id=user_session.id,
            csrf_token_hash=user_session.csrf_token_hash,
        )

    async def logout(self, context: AuthContext) -> None:
        await self.repository.revoke_session(context.session_id)
        await self.uow.commit()

    def verify_csrf(self, context: AuthContext, cookie: str | None, header: str | None) -> None:
        if not cookie or not header or cookie != header:
            raise ForbiddenError("CSRF_INVALID", "errors.csrfInvalid")
        if hash_token(header) != context.csrf_token_hash:
            raise ForbiddenError("CSRF_INVALID", "errors.csrfInvalid")

    async def get_settings(self, user_id: UUID) -> SettingsView:
        user = await self.repository.get_user_by_id(user_id)
        settings = await self.repository.get_settings(user_id)
        if user is None or settings is None:
            raise UnauthorizedError()
        return self._settings_view(user, settings)

    async def update_settings(
        self,
        user_id: UUID,
        *,
        preferred_locale: Locale | None = None,
        default_content_locale: Locale | None = None,
        default_video_width: int | None = None,
        default_video_height: int | None = None,
        default_video_fps: Decimal | None = None,
        default_caption_settings: dict[str, Any] | None = None,
    ) -> SettingsView:
        user = await self.repository.get_user_by_id(user_id)
        settings = await self.repository.get_settings(user_id)
        if user is None or settings is None:
            raise UnauthorizedError()
        if preferred_locale is not None:
            user.preferred_locale = preferred_locale
        if default_content_locale is not None:
            settings.default_content_locale = default_content_locale
        if default_video_width is not None:
            settings.default_video_width = default_video_width
        if default_video_height is not None:
            settings.default_video_height = default_video_height
        if default_video_fps is not None:
            settings.default_video_fps = default_video_fps
        if default_caption_settings is not None:
            settings.default_caption_settings = default_caption_settings
        await self.uow.commit()
        return self._settings_view(user, settings)

    async def _issue_session(self, user_id: UUID, user_agent: str | None) -> SessionCredentials:
        token = token_urlsafe(32)
        csrf_token = token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(hours=self.settings.session_lifetime_hours)
        await self.repository.add_session(
            UserSession(
                user_id=user_id,
                token_hash=hash_token(token),
                csrf_token_hash=hash_token(csrf_token),
                user_agent=user_agent[:512] if user_agent else None,
                expires_at=expires_at,
            )
        )
        return SessionCredentials(token=token, csrf_token=csrf_token, expires_at=expires_at)

    @staticmethod
    def _user_view(user: User) -> UserView:
        return UserView(id=user.id, email=user.email, preferred_locale=user.preferred_locale)

    @staticmethod
    def _settings_view(user: User, settings: UserSettings) -> SettingsView:
        return SettingsView(
            preferred_locale=user.preferred_locale,
            default_content_locale=settings.default_content_locale,
            default_video_width=settings.default_video_width,
            default_video_height=settings.default_video_height,
            default_video_fps=settings.default_video_fps,
            default_caption_settings=settings.default_caption_settings,
        )
