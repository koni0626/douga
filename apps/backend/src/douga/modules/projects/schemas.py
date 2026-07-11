from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    content_locale: Literal["ja", "en"] | None = None


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: Literal["draft", "editing", "rendered", "archived"] | None = None


class RevisionCreateRequest(BaseModel):
    lock_version: int = Field(ge=0)
    document: dict[str, Any]
    change_summary: str | None = Field(default=None, max_length=500)


class ProjectSummaryResponse(BaseModel):
    id: UUID
    name: str
    status: str
    content_locale: str
    current_revision_number: int
    lock_version: int
    scene_count: int
    estimated_duration_ms: int | None
    updated_at: datetime


class ProjectDetailResponse(BaseModel):
    project: ProjectSummaryResponse
    document: dict[str, Any]


class ProjectListResponse(BaseModel):
    items: list[ProjectSummaryResponse]
    total: int
