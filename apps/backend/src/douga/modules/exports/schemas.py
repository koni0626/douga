from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

INVALID_FILENAME_CHARACTERS = frozenset('<>:"/\\|?*')
WINDOWS_RESERVED_FILENAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


class ExportCreateRequest(BaseModel):
    project_id: UUID
    width: int | None = Field(default=None, ge=320, le=7680)
    height: int | None = Field(default=None, ge=240, le=4320)
    fps: int | None = Field(default=None, ge=1, le=60)
    filename: str | None = Field(default=None, min_length=1, max_length=255)

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str | None) -> str | None:
        if value is None:
            return None
        filename = value.strip()
        if not filename or any(
            character in INVALID_FILENAME_CHARACTERS or ord(character) < 32
            for character in filename
        ):
            raise ValueError("filename contains invalid characters")
        if not filename.lower().endswith(".mp4"):
            filename += ".mp4"
        if len(filename) > 255:
            raise ValueError("filename is too long")
        if filename.rsplit(".", 1)[0].upper() in WINDOWS_RESERVED_FILENAMES:
            raise ValueError("filename is reserved")
        return filename


class PreviewCreateRequest(BaseModel):
    revision_number: int | None = Field(default=None, ge=1)
    range_start_ms: int = Field(default=0, ge=0)
    range_end_ms: int = Field(gt=0)
    width: int = Field(default=960, ge=320, le=1920)
    height: int = Field(default=540, ge=240, le=1080)
    fps: int = Field(default=10, ge=1, le=60)


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
