from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class UploadBeginRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    original_filename: str = Field(min_length=1, max_length=255)
    kind: Literal["image", "video", "audio"]
    content_type: str | None = Field(default=None, min_length=1, max_length=100)
    size_bytes: int | None = Field(default=None, ge=1)
    sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")


class AssetUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    tags: list[str] | None = Field(default=None, max_length=50)


class AssetResponse(BaseModel):
    id: UUID
    kind: str
    source: str
    status: str
    name: str
    original_filename: str | None
    mime_type: str | None
    size_bytes: int | None
    width: int | None
    height: int | None
    duration_ms: int | None
    tags: list[str]


class UploadTargetResponse(BaseModel):
    asset: AssetResponse
    upload_path: str


class AssetListResponse(BaseModel):
    items: list[AssetResponse]
    total: int
