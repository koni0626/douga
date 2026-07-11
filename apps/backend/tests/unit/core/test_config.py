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
