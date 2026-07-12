from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.errors import ForbiddenError
from douga.db.session import get_session
from douga.modules.auth.dependencies import principal_auth
from douga.modules.auth.service import AuthContext
from douga.modules.automation.schemas import AutomationOperationResponse
from douga.modules.automation.service import AutomationService

router = APIRouter(prefix="/automation/operations", tags=["automation"])
OPERATION_READ_SCOPES = {
    "project_create": "projects:read",
    "project_revision_save": "projects:read",
    "project_validate": "projects:read",
    "project_duplicate": "projects:read",
    "creative_document_save": "creative:read",
    "preview_create": "previews:read",
    "asset_upload_begin": "assets:read",
    "asset_upload_complete": "assets:read",
    "image_generation_create": "image-generations:read",
    "export_create": "exports:read",
}


@router.get("/{operation_id}", response_model=AutomationOperationResponse)
async def get_operation(
    operation_id: UUID,
    context: Annotated[AuthContext, Depends(principal_auth)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AutomationOperationResponse:
    operation = await AutomationService(session).get_operation(operation_id, context.user.id)
    required_scope = OPERATION_READ_SCOPES.get(operation.operation_type)
    if context.auth_method == "api_token" and (
        required_scope is None or required_scope not in context.scopes
    ):
        raise ForbiddenError("API_TOKEN_SCOPE_REQUIRED", "errors.apiTokenScopeRequired")
    return AutomationOperationResponse(
        id=operation.id,
        source=operation.source,
        external_run_id=operation.external_run_id,
        operation_type=operation.operation_type,
        status=operation.status,
        project_id=operation.project_id,
        resource_type=operation.resource_type,
        resource_id=operation.resource_id,
        summary=operation.summary_json,
        error_code=operation.error_code,
        created_at=operation.created_at,
        finished_at=operation.finished_at,
    )
