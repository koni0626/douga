from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.assets.schemas import (
    AssetListResponse,
    AssetResponse,
    AssetUpdateRequest,
    UploadBeginRequest,
    UploadTargetResponse,
)
from douga.modules.assets.service import AssetList, AssetService, AssetView, UploadTarget
from douga.modules.auth.dependencies import csrf_protected_auth, current_auth
from douga.modules.auth.service import AuthContext

router = APIRouter(prefix="/assets", tags=["assets"])


def asset_response(asset: AssetView) -> AssetResponse:
    return AssetResponse.model_validate(asset, from_attributes=True)


def upload_response(target: UploadTarget) -> UploadTargetResponse:
    return UploadTargetResponse(asset=asset_response(target.asset), upload_path=target.upload_path)


@router.get("", response_model=AssetListResponse)
async def list_assets(
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str | None, Query(max_length=255)] = None,
    kind: Annotated[Literal["image", "video", "audio"] | None, Query()] = None,
    asset_status: Annotated[
        Literal["pending", "processing", "ready", "failed"] | None, Query(alias="status")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AssetListResponse:
    result: AssetList = await AssetService(session).list_assets(
        context.user.id,
        search=search,
        kind=kind,
        status=asset_status,
        limit=limit,
        offset=offset,
    )
    return AssetListResponse(
        items=[asset_response(asset) for asset in result.items], total=result.total
    )


@router.post("/uploads", response_model=UploadTargetResponse, status_code=status.HTTP_201_CREATED)
async def begin_upload(
    payload: UploadBeginRequest,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UploadTargetResponse:
    return upload_response(
        await AssetService(session).begin_upload(
            context.user.id,
            name=payload.name,
            original_filename=payload.original_filename,
            kind=payload.kind,
        )
    )


@router.put("/{asset_id}/content", response_model=AssetResponse)
async def upload_content(
    asset_id: UUID,
    request: Request,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssetResponse:
    return asset_response(
        await AssetService(session).store_upload(asset_id, context.user.id, request.stream())
    )


@router.post("/{asset_id}/complete", response_model=AssetResponse)
async def complete_upload(
    asset_id: UUID,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssetResponse:
    return asset_response(await AssetService(session).complete_upload(asset_id, context.user.id))


@router.get("/{asset_id}/content", response_class=FileResponse)
async def get_content(
    asset_id: UUID,
    context: Annotated[AuthContext, Depends(current_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    path, media_type = await AssetService(session).content_path(asset_id, context.user.id)
    return FileResponse(path, media_type=media_type, filename=None)


@router.patch("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: UUID,
    payload: AssetUpdateRequest,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssetResponse:
    return asset_response(
        await AssetService(session).update_asset(
            asset_id, context.user.id, name=payload.name, tags=payload.tags
        )
    )


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: UUID,
    context: Annotated[AuthContext, Depends(csrf_protected_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    await AssetService(session).delete_asset(asset_id, context.user.id)
