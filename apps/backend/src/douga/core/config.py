from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_secret_key: str = Field(min_length=32)
    database_url: str = "postgresql+asyncpg://douga:douga-local-only@127.0.0.1:5432/douga"
    allowed_origins: tuple[str, ...] = ("http://127.0.0.1:5173",)
    session_cookie_name: str = "douga_session"
    csrf_cookie_name: str = "douga_csrf"
    session_lifetime_hours: int = Field(default=336, ge=1, le=24 * 90)
    auth_rate_limit_per_minute: int = Field(default=10, ge=1, le=1000)
    local_storage_path: Path = Path(".local-data/storage")
    max_upload_bytes: int = Field(default=200 * 1024 * 1024, ge=1024)
    ffprobe_path: str = "ffprobe"
    ffmpeg_path: str = "ffmpeg"
    redis_url: str = "redis://127.0.0.1:6379/0"
    job_dispatch_mode: Literal["inline", "redis"] = "inline"
    openai_api_key: SecretStr | None = None
    openai_image_model: str = "gpt-image-2"
    openai_assistant_model: str = "gpt-5.6"
    assistant_provider: Literal["auto", "fake", "openai"] = "auto"
    assistant_history_limit: int = Field(default=30, ge=1, le=100)
    image_provider: Literal["fake", "openai"] = "fake"
    image_generation_limit_per_hour: int = Field(default=20, ge=1, le=1000)
    export_timeout_seconds: int = Field(default=900, ge=30, le=7200)
    export_limit_per_hour: int = Field(default=5, ge=1, le=100)
    max_json_request_bytes: int = Field(default=2 * 1024 * 1024, ge=1024)

    @property
    def secure_cookies(self) -> bool:
        return self.app_env == "production"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.lstrip().startswith("["):
            return tuple(origin.strip() for origin in value.split(",") if origin.strip())
        return value

    @model_validator(mode="after")
    def validate_production_security(self) -> Settings:
        if "*" in self.allowed_origins:
            raise ValueError("Wildcard CORS origins are not allowed with credentials")
        if self.app_env == "production" and any(
            not origin.startswith("https://") for origin in self.allowed_origins
        ):
            raise ValueError("Production origins must use HTTPS")
        if self.app_env == "production" and self.image_provider == "fake":
            raise ValueError("Production must configure a real image provider")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
