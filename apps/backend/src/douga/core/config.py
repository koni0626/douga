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
    test_database_url: str | None = None
    allowed_origins: tuple[str, ...] = (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    )
    session_cookie_name: str = "douga_session"
    csrf_cookie_name: str = "douga_csrf"
    session_lifetime_hours: int = Field(default=336, ge=1, le=24 * 90)
    auth_rate_limit_per_minute: int = Field(default=10, ge=1, le=1000)
    api_token_rate_limit_per_minute: int = Field(default=120, ge=1, le=10_000)
    local_storage_path: Path = Path(".local-data/storage")
    test_local_storage_path: Path = Path(".local-data/test-storage")
    max_upload_bytes: int = Field(default=200 * 1024 * 1024, ge=1024)
    max_image_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1024)
    max_audio_upload_bytes: int = Field(default=200 * 1024 * 1024, ge=1024)
    max_video_upload_bytes: int = Field(default=1024 * 1024 * 1024, ge=1024)
    max_image_pixels: int = Field(default=80_000_000, ge=1_000_000)
    max_audio_duration_ms: int = Field(default=4 * 60 * 60 * 1000, ge=1_000)
    max_video_duration_ms: int = Field(default=60 * 60 * 1000, ge=1_000)
    max_concurrent_uploads: int = Field(default=4, ge=1, le=100)
    max_concurrent_previews: int = Field(default=2, ge=1, le=20)
    max_concurrent_exports: int = Field(default=1, ge=1, le=20)
    ffprobe_path: str = "ffprobe"
    ffmpeg_path: str = "ffmpeg"
    redis_url: str = "redis://127.0.0.1:6379/0"
    job_dispatch_mode: Literal["inline", "redis"] = "inline"
    openai_api_key: SecretStr | None = None
    openai_image_model: str = "gpt-image-2"
    openai_assistant_model: str = "gpt-5.6"
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    openai_timeout_seconds: float = Field(default=120, ge=5, le=600)
    aivis_base_url: str = "http://127.0.0.1:10101"
    aivis_engine_path: Path | None = None
    aivis_auto_start: bool = True
    aivis_request_timeout_seconds: float = Field(default=180, ge=5, le=600)
    aivis_startup_timeout_seconds: float = Field(default=300, ge=5, le=600)
    aivis_max_text_length: int = Field(default=500, ge=1, le=5_000)
    assistant_provider: Literal["auto", "fake", "openai"] = "auto"
    assistant_history_limit: int = Field(default=30, ge=1, le=100)
    assistant_recent_history_limit: int = Field(default=12, ge=2, le=50)
    assistant_context_compact_token_threshold: int = Field(default=120_000, ge=32_000, le=1_000_000)
    assistant_cached_input_token_weight: float = Field(default=0.1, ge=0, le=1)
    assistant_max_tool_calls: int = Field(default=1_000, ge=1, le=1_000)
    assistant_run_limit_per_hour: int = Field(default=60, ge=1, le=1000)
    assistant_token_limit_per_run: int = Field(default=600_000, ge=1_000, le=10_000_000)
    assistant_token_limit_per_hour: int = Field(default=2_000_000, ge=1_000, le=100_000_000)
    image_provider: Literal["fake", "openai"] = "fake"
    image_generation_limit_per_hour: int = Field(default=20, ge=1, le=1000)
    export_timeout_seconds: int = Field(default=900, ge=30, le=7200)
    export_limit_per_hour: int = Field(default=5, ge=1, le=100)
    max_json_request_bytes: int = Field(default=5 * 1024 * 1024, ge=1024)

    @property
    def secure_cookies(self) -> bool:
        return self.app_env == "production"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.lstrip().startswith("["):
            return tuple(origin.strip() for origin in value.split(",") if origin.strip())
        return value

    @field_validator("aivis_engine_path", mode="before")
    @classmethod
    def parse_optional_path(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def validate_production_security(self) -> Settings:
        if self.app_env == "development":
            self.allowed_origins = tuple(
                dict.fromkeys(
                    (
                        *self.allowed_origins,
                        "http://127.0.0.1:5173",
                        "http://localhost:5173",
                    )
                )
            )
        if "*" in self.allowed_origins:
            raise ValueError("Wildcard CORS origins are not allowed with credentials")
        if self.app_env == "production" and any(
            not origin.startswith("https://") for origin in self.allowed_origins
        ):
            raise ValueError("Production origins must use HTTPS")
        if self.app_env == "production" and self.image_provider == "fake":
            raise ValueError("Production must configure a real image provider")
        if self.app_env == "test":
            self.database_url = self.test_database_url or (
                "postgresql+asyncpg://invalid:invalid@127.0.0.1:1/"
                "douga_test_database_url_is_required"
            )
            self.local_storage_path = self.test_local_storage_path
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
