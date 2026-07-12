from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from douga.db.session import get_session
from douga.modules.assistant.creative_schemas import (
    CreativeDocumentListResponse,
    CreativeDocumentResponse,
    CreativeDocumentSaveRequest,
    CreativeKind,
)
from douga.modules.assistant.creative_service import CreativeDocumentService
from douga.modules.assistant.models import CreativeDocument
from douga.modules.auth.dependencies import scoped_auth, scoped_write_auth
from douga.modules.auth.service import AuthContext

router = APIRouter(prefix="/projects/{project_id}/creative-documents", tags=["creative"])


def document_response(document: CreativeDocument) -> CreativeDocumentResponse:
    return CreativeDocumentResponse.model_validate(document, from_attributes=True)


@router.get("", response_model=CreativeDocumentListResponse)
async def list_documents(
    project_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_auth("creative:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CreativeDocumentListResponse:
    items = await CreativeDocumentService(session).list_documents(project_id, context.user.id)
    return CreativeDocumentListResponse(items=[document_response(item) for item in items])


@router.get("/{kind}", response_model=CreativeDocumentResponse)
async def get_document(
    project_id: UUID,
    kind: CreativeKind,
    context: Annotated[AuthContext, Depends(scoped_auth("creative:read"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CreativeDocumentResponse:
    return document_response(
        await CreativeDocumentService(session).get_kind(project_id, context.user.id, kind)
    )


@router.post("", response_model=CreativeDocumentResponse, status_code=status.HTTP_201_CREATED)
async def save_document(
    project_id: UUID,
    payload: CreativeDocumentSaveRequest,
    context: Annotated[AuthContext, Depends(scoped_write_auth("creative:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CreativeDocumentResponse:
    return document_response(
        await CreativeDocumentService(session).save(
            project_id,
            context.user.id,
            kind=payload.kind,
            status=payload.status,
            content=payload.content,
            source_run_id=payload.source_run_id,
        )
    )


@router.post("/{document_id}/adopt", response_model=CreativeDocumentResponse)
async def adopt_document(
    project_id: UUID,
    document_id: UUID,
    context: Annotated[AuthContext, Depends(scoped_write_auth("creative:write"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CreativeDocumentResponse:
    return document_response(
        await CreativeDocumentService(session).adopt(project_id, document_id, context.user.id)
    )
