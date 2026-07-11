from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ExportCreateRequest(BaseModel):
    project_id: UUID


class ExportResponse(BaseModel):
    id: UUID
    project_id: UUID
    project_revision_id: UUID
    job_id: UUID
    name: str
    status: str
    progress: int
    width: int
    height: int
    fps: int
    size_bytes: int | None
    duration_ms: int | None
    error_code: str | None
    created_at: datetime


class ExportListResponse(BaseModel):
    items: list[ExportResponse]
    total: int
