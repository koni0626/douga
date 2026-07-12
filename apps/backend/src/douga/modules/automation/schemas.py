from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AutomationOperationResponse(BaseModel):
    id: UUID
    source: str
    external_run_id: str | None
    operation_type: str
    status: str
    project_id: UUID | None
    resource_type: str | None
    resource_id: UUID | None
    summary: dict[str, Any]
    error_code: str | None
    created_at: datetime
    finished_at: datetime | None
