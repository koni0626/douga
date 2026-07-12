from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    password_confirmation: str = Field(min_length=12, max_length=128)
    locale: Literal["ja", "en"] = "ja"

    @model_validator(mode="after")
    def passwords_match(self) -> RegisterRequest:
        if self.password != self.password_confirmation:
            raise ValueError("passwords do not match")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)
    new_password_confirmation: str = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def new_passwords_match(self) -> PasswordChangeRequest:
        if self.new_password != self.new_password_confirmation:
            raise ValueError("new passwords do not match")
        return self


class UserResponse(BaseModel):
    id: UUID
    email: str
    preferred_locale: str


class SettingsResponse(BaseModel):
    preferred_locale: str
    default_content_locale: str
    default_video_width: int
    default_video_height: int
    default_video_fps: Decimal
    default_caption_settings: dict[str, Any]


class SettingsUpdateRequest(BaseModel):
    preferred_locale: Literal["ja", "en"] | None = None
    default_content_locale: Literal["ja", "en"] | None = None
    default_video_width: int | None = Field(default=None, ge=320, le=7680)
    default_video_height: int | None = Field(default=None, ge=240, le=4320)
    default_video_fps: Decimal | None = Field(default=None, gt=0, le=120)
    default_caption_settings: dict[str, Any] | None = None
