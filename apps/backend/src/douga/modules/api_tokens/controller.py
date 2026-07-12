from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.api_tokens.models import ApiToken
from douga.modules.api_tokens.schemas import (
    ApiTokenCreateRequest,
    ApiTokenIssuedResponse,
    ApiTokenListResponse,
    ApiTokenResponse,
)
from douga.modules.api_tokens.service import ApiTokenService
from douga.modules.auth.dependencies import csrf_protected_auth, current_auth
from douga.modules.auth.service import AuthContext

router = APIRouter(prefix="/settings/api-tokens", tags=["api-tokens"])


def token_response(token: ApiToken) -> ApiTokenResponse:
    return ApiTokenResponse.model_validate(token, from_attributes=True)


@router.get("", response_model=ApiTokenListResponse)
async def list_api_tokens(
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ApiTokenListResponse:
    tokens = await ApiTokenService(session).list_owned(context.user.id)
    return ApiTokenListResponse(items=[token_response(token) for token in tokens])


@router.post("", response_model=ApiTokenIssuedResponse, status_code=status.HTTP_201_CREATED)
async def issue_api_token(
    payload: ApiTokenCreateRequest,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ApiTokenIssuedResponse:
    issued = await ApiTokenService(session).issue(
        context.user.id,
        name=payload.name,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
    )
    response = token_response(issued.record)
    return ApiTokenIssuedResponse(**response.model_dump(), token=issued.token)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_token(
    token_id: UUID,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await ApiTokenService(session).revoke(token_id, context.user.id)
