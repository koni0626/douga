import pytest
from douga.core.config import Settings
from pydantic import ValidationError


def test_comma_separated_origins_are_parsed() -> None:
    settings = Settings(
        app_secret_key="test-secret-key-with-at-least-32-characters",
        allowed_origins="http://localhost:3000,https://example.com",
    )

    assert settings.allowed_origins == ("http://localhost:3000", "https://example.com")


def test_production_requires_https_and_real_image_provider() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            app_secret_key="test-secret-key-with-at-least-32-characters",
            allowed_origins=("http://example.com",),
        )


def test_test_environment_never_falls_back_to_development_database_or_storage() -> None:
    settings = Settings(
        app_env="test",
        app_secret_key="test-secret-key-with-at-least-32-characters",
        database_url="postgresql+asyncpg://user:secret@127.0.0.1:5432/douga",
        test_database_url=None,
        _env_file=None,
    )
    assert settings.database_url.endswith("/douga_test_database_url_is_required")
    assert settings.local_storage_path.as_posix().endswith(".local-data/test-storage")

    configured = Settings(
        app_env="test",
        app_secret_key="test-secret-key-with-at-least-32-characters",
        database_url="postgresql+asyncpg://user:secret@127.0.0.1:5432/douga",
        test_database_url="postgresql+asyncpg://user:secret@127.0.0.1:5432/douga_test",
        _env_file=None,
    )
    assert configured.database_url.endswith("/douga_test")
