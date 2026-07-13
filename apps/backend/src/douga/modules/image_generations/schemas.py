from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ImageGenerationCreateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    quality: Literal["low", "medium", "high"] = "medium"
    size: Literal["1024x1024", "1024x1536", "1536x1024"] = "1024x1024"


class ImageGenerationResponse(BaseModel):
    id: UUID
    job_id: UUID
    prompt: str
    model: str
    quality: str
    size: str
    status: str
    progress: int
    parent_asset_id: UUID | None
    output_asset_id: UUID | None
    error_code: str | None
    created_at: datetime


class ImageGenerationListResponse(BaseModel):
    items: list[ImageGenerationResponse]
    total: int
