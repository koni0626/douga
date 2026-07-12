from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.db.session import get_session
from douga.modules.auth.dependencies import (
    csrf_protected_auth,
    current_auth,
    trusted_origin,
)
from douga.modules.auth.rate_limit import auth_rate_limiter
from douga.modules.auth.schemas import (
    LoginRequest,
    PasswordChangeRequest,
    RegisterRequest,
    SettingsResponse,
    SettingsUpdateRequest,
    UserResponse,
)
from douga.modules.auth.service import AuthContext, AuthResult, AuthService

router = APIRouter(tags=["auth"])


def set_auth_cookies(response: Response, result: AuthResult) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        result.credentials.token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        expires=result.credentials.expires_at,
        path="/",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        result.credentials.csrf_token,
        httponly=False,
        secure=settings.secure_cookies,
        samesite="lax",
        expires=result.credentials.expires_at,
        path="/",
    )


@router.post(
    "/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(trusted_origin)],
)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserResponse:
    await auth_rate_limiter.check(request)
    result = await AuthService(session).register(
        str(payload.email), payload.password, payload.locale, request.headers.get("User-Agent")
    )
    set_auth_cookies(response, result)
    return UserResponse.model_validate(result.user, from_attributes=True)


@router.post("/auth/login", response_model=UserResponse, dependencies=[Depends(trusted_origin)])
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserResponse:
    await auth_rate_limiter.check(request)
    result = await AuthService(session).login(
        str(payload.email), payload.password, request.headers.get("User-Agent")
    )
    set_auth_cookies(response, result)
    return UserResponse.model_validate(result.user, from_attributes=True)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await AuthService(session).logout(context)
    settings = get_settings()
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie(settings.csrf_cookie_name, path="/")


@router.get("/auth/me", response_model=UserResponse)
async def me(context: Annotated[AuthContext, Depends(current_auth)]) -> UserResponse:
    return UserResponse.model_validate(context.user, from_attributes=True)


@router.patch("/auth/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: PasswordChangeRequest,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await AuthService(session).change_password(
        context, payload.current_password, payload.new_password
    )


@router.get("/settings", response_model=SettingsResponse)
async def get_user_settings(
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SettingsResponse:
    result = await AuthService(session).get_settings(context.user.id)
    return SettingsResponse.model_validate(result, from_attributes=True)


@router.patch("/settings", response_model=SettingsResponse)
async def update_user_settings(
    payload: SettingsUpdateRequest,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SettingsResponse:
    result = await AuthService(session).update_settings(
        context.user.id, **payload.model_dump(exclude_unset=True)
    )
    return SettingsResponse.model_validate(result, from_attributes=True)
