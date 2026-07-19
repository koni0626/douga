from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.assets.schemas import AssetResponse
from douga.modules.auth.dependencies import scoped_auth, scoped_write_auth
from douga.modules.auth.service import AuthContext
from douga.modules.speech.schemas import (
    SpeechSynthesisRequest,
    SpeechSynthesisResponse,
    SpeechVoiceListResponse,
    SpeechVoiceResponse,
)
from douga.modules.speech.service import SpeechService

router = APIRouter(prefix="/speech", tags=["speech"])


@router.get("/voices", response_model=SpeechVoiceListResponse)
async def list_voices(
    _: Annotated[AuthContext, Depends(scoped_auth("assets:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SpeechVoiceListResponse:
    voices = await SpeechService(session).list_voices()
    return SpeechVoiceListResponse(
        items=[SpeechVoiceResponse.model_validate(voice, from_attributes=True) for voice in voices]
    )


@router.post(
    "/syntheses",
    response_model=SpeechSynthesisResponse,
    status_code=status.HTTP_201_CREATED,
)
async def synthesize(
    payload: SpeechSynthesisRequest,
    context: Annotated[AuthContext, Depends(scoped_write_auth("assets:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SpeechSynthesisResponse:
    asset = await SpeechService(session).synthesize(context.user.id, payload)
    return SpeechSynthesisResponse(asset=AssetResponse.model_validate(asset, from_attributes=True))
