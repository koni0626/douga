import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from douga.db.unit_of_work import UnitOfWork
from douga.modules.api_tokens.models import ApiToken
from douga.modules.api_tokens.repository import ApiTokenRepository
from douga.modules.auth.service import AuthContext, UserView

API_TOKEN_SCOPES = frozenset(
    {
        "projects:read",
        "projects:write",
        "assets:read",
        "assets:write",
        "creative:read",
        "creative:write",
        "previews:read",
        "previews:write",
        "exports:read",
        "exports:write",
        "image-generations:read",
        "image-generations:write",
    }
)


@dataclass(frozen=True, slots=True)
class IssuedApiToken:
    record: ApiToken
    token: str


def hash_api_token(token: str) -> str:
    secret = get_settings().app_secret_key.encode("utf-8")
    return hmac.new(secret, token.encode("utf-8"), sha256).hexdigest()


class ApiTokenService:
    def __init__(self, session: AsyncSession) -> None:
        self.repository = ApiTokenRepository(session)
        self.uow = UnitOfWork(session)

    async def issue(
        self, user_id: UUID, *, name: str, scopes: list[str], expires_at: datetime | None
    ) -> IssuedApiToken:
        normalized_scopes = sorted(set(scopes))
        unknown = set(normalized_scopes) - API_TOKEN_SCOPES
        if unknown:
            raise ForbiddenError("API_TOKEN_SCOPE_INVALID", "errors.apiTokenScopeInvalid")
        if expires_at is not None:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at <= datetime.now(UTC):
                raise ForbiddenError("API_TOKEN_EXPIRY_INVALID", "errors.apiTokenExpiryInvalid")

        secret = token_urlsafe(32)
        plaintext = f"dga_pat_{secret}"
        record = ApiToken(
            user_id=user_id,
            name=name.strip(),
            token_hash=hash_api_token(plaintext),
            token_prefix=plaintext[:16],
            scopes=normalized_scopes,
            expires_at=expires_at,
            created_at=datetime.now(UTC),
        )
        await self.repository.add(record)
        await self.uow.commit()
        return IssuedApiToken(record, plaintext)

    async def list_owned(self, user_id: UUID) -> list[ApiToken]:
        return await self.repository.list_owned(user_id)

    async def revoke(self, token_id: UUID, user_id: UUID) -> None:
        if not await self.repository.revoke(token_id, user_id):
            raise NotFoundError("API_TOKEN_NOT_FOUND", "errors.apiTokenNotFound")
        await self.uow.commit()

    async def authenticate(self, plaintext: str) -> AuthContext:
        result = await self.repository.get_active_with_user(hash_api_token(plaintext))
        if result is None:
            raise UnauthorizedError("API_TOKEN_INVALID", "errors.apiTokenInvalid")
        token, user = result
        await self.repository.touch_last_used(token.id)
        await self.uow.commit()
        return AuthContext(
            user=UserView(id=user.id, email=user.email, preferred_locale=user.preferred_locale),
            session_id=None,
            csrf_token_hash=None,
            api_token_id=token.id,
            scopes=frozenset(token.scopes),
            auth_method="api_token",
        )
