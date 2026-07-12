from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class AssistantThreadCreateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)


class AssistantEditorContext(BaseModel):
    time_ms: int = Field(ge=0, le=3_600_000)
    selected_layer_id: str | None = Field(default=None, max_length=100)
    visible_start_ms: int = Field(ge=0, le=3_600_000)
    visible_end_ms: int = Field(gt=0, le=3_600_000)

    @model_validator(mode="after")
    def validate_visible_range(self) -> AssistantEditorContext:
        if self.visible_end_ms <= self.visible_start_ms:
            raise ValueError("visible_end_ms must be greater than visible_start_ms")
        return self


class AssistantMessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)
    context: AssistantEditorContext | None = None


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
    undo_revision_number: int | None
    created_at: datetime


class AssistantToolCallResponse(BaseModel):
    id: UUID
    run_id: UUID
    tool_name: str
    arguments_json: dict[str, object]
    result_json: dict[str, object] | None
    status: str
    approval_required: bool
    approved_at: datetime | None
    created_at: datetime
    finished_at: datetime | None


class AssistantThreadDetailResponse(BaseModel):
    thread: AssistantThreadResponse
    messages: list[AssistantMessageResponse]
    runs: list[AssistantRunResponse]
    tool_calls: list[AssistantToolCallResponse]


class AssistantUndoResponse(BaseModel):
    run_id: UUID
    revision_number: int
    lock_version: int
