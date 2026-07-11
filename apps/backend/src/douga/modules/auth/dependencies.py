from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ForbiddenError
from douga.db.session import get_session
from douga.modules.auth.service import AuthContext, AuthService


async def current_auth(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> AuthContext:
    settings = get_settings()
    return await AuthService(session).authenticate(
        request.cookies.get(settings.session_cookie_name)
    )


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
