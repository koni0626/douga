from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Header, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ForbiddenError, UnauthorizedError
from douga.db.session import get_session
from douga.modules.auth.service import AuthContext, AuthService

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="PersonalApiToken",
    description="Personal API Token issued from the Douga settings screen.",
)


async def current_auth(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> AuthContext:
    settings = get_settings()
    return await AuthService(session).authenticate(
        request.cookies.get(settings.session_cookie_name)
    )


async def principal_auth(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)],
) -> AuthContext:
    settings = get_settings()
    session_cookie = request.cookies.get(settings.session_cookie_name)
    authorization = request.headers.get("Authorization")
    if authorization and session_cookie:
        raise UnauthorizedError("AUTH_AMBIGUOUS", "errors.authAmbiguous")
    if authorization:
        if credentials is None or not credentials.credentials.strip():
            raise UnauthorizedError("API_TOKEN_INVALID", "errors.apiTokenInvalid")
        from douga.modules.api_tokens.rate_limit import api_token_rate_limiter
        from douga.modules.api_tokens.service import ApiTokenService

        context = await ApiTokenService(session).authenticate(credentials.credentials.strip())
        if context.api_token_id is None:
            raise UnauthorizedError("API_TOKEN_INVALID", "errors.apiTokenInvalid")
        await api_token_rate_limiter.check(context.api_token_id, context.user.id)
        return context
    return await AuthService(session).authenticate(session_cookie)


def scoped_auth(scope: str) -> Callable[..., Awaitable[AuthContext]]:
    async def dependency(
        context: Annotated[AuthContext, Depends(principal_auth)],
    ) -> AuthContext:
        if context.auth_method == "api_token" and scope not in context.scopes:
            raise ForbiddenError("API_TOKEN_SCOPE_REQUIRED", "errors.apiTokenScopeRequired")
        return context

    return dependency


def scoped_any_auth(scopes: frozenset[str]) -> Callable[..., Awaitable[AuthContext]]:
    async def dependency(
        context: Annotated[AuthContext, Depends(principal_auth)],
    ) -> AuthContext:
        if context.auth_method == "api_token" and context.scopes.isdisjoint(scopes):
            raise ForbiddenError("API_TOKEN_SCOPE_REQUIRED", "errors.apiTokenScopeRequired")
        return context

    return dependency


def scoped_write_auth(scope: str) -> Callable[..., Awaitable[AuthContext]]:
    async def dependency(
        request: Request,
        context: Annotated[AuthContext, Depends(principal_auth)],
        session: Annotated[AsyncSession, Depends(get_session)],
        csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
    ) -> AuthContext:
        if context.auth_method == "api_token":
            if scope not in context.scopes:
                raise ForbiddenError("API_TOKEN_SCOPE_REQUIRED", "errors.apiTokenScopeRequired")
            return context
        settings = get_settings()
        origin = request.headers.get("Origin")
        if origin is not None and origin not in settings.allowed_origins:
            raise ForbiddenError("ORIGIN_NOT_ALLOWED", "errors.originNotAllowed")
        AuthService(session).verify_csrf(
            context, request.cookies.get(settings.csrf_cookie_name), csrf_header
        )
        return context

    return dependency


async def csrf_protected_auth(
    request: Request,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> AuthContext:
    settings = get_settings()
    origin = request.headers.get("Origin")
    if origin is not None and origin not in settings.allowed_origins:
        raise ForbiddenError("ORIGIN_NOT_ALLOWED", "errors.originNotAllowed")
    AuthService(session).verify_csrf(
        context, request.cookies.get(settings.csrf_cookie_name), csrf_header
    )
    return context


async def trusted_origin(request: Request) -> None:
    origin = request.headers.get("Origin")
    if origin is not None and origin not in get_settings().allowed_origins:
        raise ForbiddenError("ORIGIN_NOT_ALLOWED", "errors.originNotAllowed")
