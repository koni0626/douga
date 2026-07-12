from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ExportCreateRequest(BaseModel):
    project_id: UUID


class PreviewCreateRequest(BaseModel):
    revision_number: int | None = Field(default=None, ge=1)
    range_start_ms: int = Field(default=0, ge=0)
    range_end_ms: int = Field(gt=0)
    width: int = Field(default=960, ge=320, le=1920)
    height: int = Field(default=540, ge=240, le=1080)
    fps: int = Field(default=30, ge=1, le=60)


class ExportResponse(BaseModel):
    id: UUID
    project_id: UUID
    project_revision_id: UUID
    job_id: UUID
    name: str
    kind: str
    range_start_ms: int | None
    range_end_ms: int | None
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
