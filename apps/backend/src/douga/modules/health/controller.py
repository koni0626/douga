from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.health.schemas import HealthResponse
from douga.modules.health.service import HealthService

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
async def live() -> HealthResponse:
    return HealthResponse()


@router.get("/ready", response_model=HealthResponse)
async def ready(session: Annotated[AsyncSession, Depends(get_session)]) -> HealthResponse:
    await HealthService(session).check_database()
    return HealthResponse()
