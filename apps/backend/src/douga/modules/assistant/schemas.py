from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AssistantThreadCreateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)


class AssistantMessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)


class AssistantThreadResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


class AssistantMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime


class AssistantThreadListResponse(BaseModel):
    items: list[AssistantThreadResponse]


class AssistantThreadDetailResponse(BaseModel):
    thread: AssistantThreadResponse
    messages: list[AssistantMessageResponse]


class AssistantRunStartedResponse(BaseModel):
    run_id: UUID
    status: str
    user_message: AssistantMessageResponse


class AssistantRunResponse(BaseModel):
    id: UUID
    status: str
    error_code: str | None
    base_revision_number: int
    result_revision_number: int | None
