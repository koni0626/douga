from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
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

    @property
    def secure_cookies(self) -> bool:
        return self.app_env == "production"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.lstrip().startswith("["):
            return tuple(origin.strip() for origin in value.split(",") if origin.strip())
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
