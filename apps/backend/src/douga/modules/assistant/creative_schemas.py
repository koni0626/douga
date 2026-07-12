from datetime import datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

CreativeKind = Literal["brief", "plot", "script", "storyboard"]
CreativeStatus = Literal["draft", "proposed", "approved", "superseded"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BriefContent(StrictModel):
    purpose: str = Field(min_length=1, max_length=1_000)
    target_audience: str = Field(min_length=1, max_length=1_000)
    core_message: str = Field(min_length=1, max_length=1_000)
    tone: str = Field(min_length=1, max_length=500)
    target_duration_ms: int = Field(ge=1_000, le=3_600_000)
    aspect_ratio: str = Field(pattern=r"^\d{1,2}:\d{1,2}$")
    constraints: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(max_length=20)


class PlotSection(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(min_length=1, max_length=2_000)
    purpose: str = Field(min_length=1, max_length=1_000)
    duration_ms: int = Field(ge=100, le=3_600_000)


class PlotContent(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    logline: str = Field(min_length=1, max_length=2_000)
    sections: list[PlotSection] = Field(min_length=1, max_length=100)


class ScriptBlock(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)
    narration: str = Field(max_length=10_000)
    caption: str = Field(max_length=10_000)
    visual_direction: str = Field(max_length=5_000)
    plot_section_id: str | None = Field(max_length=100)

    @model_validator(mode="after")
    def validate_range(self) -> ScriptBlock:
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        return self


class ScriptContent(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    blocks: list[ScriptBlock] = Field(min_length=1, max_length=500)


class CameraDirection(StrictModel):
    preset: str = Field(min_length=1, max_length=100)
    intensity: float = Field(ge=0, le=1)


class StoryboardShot(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)
    description: str = Field(min_length=1, max_length=5_000)
    asset_requirements: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(
        max_length=30
    )
    camera: CameraDirection | None
    script_block_ids: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        max_length=100
    )

    @model_validator(mode="after")
    def validate_range(self) -> StoryboardShot:
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        return self


class StoryboardContent(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    shots: list[StoryboardShot] = Field(min_length=1, max_length=500)


CONTENT_ADAPTERS: dict[str, TypeAdapter[Any]] = {
    "brief": TypeAdapter(BriefContent),
    "plot": TypeAdapter(PlotContent),
    "script": TypeAdapter(ScriptContent),
    "storyboard": TypeAdapter(StoryboardContent),
}


def validate_creative_content(kind: CreativeKind, content: dict[str, Any]) -> dict[str, Any]:
    validated = cast(BaseModel, CONTENT_ADAPTERS[kind].validate_python(content))
    return validated.model_dump(mode="json")


class CreativeDocumentSaveRequest(BaseModel):
    kind: CreativeKind
    status: Literal["draft", "proposed"] = "draft"
    content: dict[str, Any]
    source_run_id: UUID | None = None


class CreativeDocumentResponse(BaseModel):
    id: UUID
    project_id: UUID
    kind: CreativeKind
    status: CreativeStatus
    version: int
    content: dict[str, Any]
    source_run_id: UUID | None
    created_at: datetime
    updated_at: datetime


class CreativeDocumentListResponse(BaseModel):
    items: list[CreativeDocumentResponse]
