from douga.core.config import Settings


def test_comma_separated_origins_are_parsed() -> None:
    settings = Settings(
        app_secret_key="test-secret-key-with-at-least-32-characters",
        allowed_origins="http://localhost:3000,https://example.com",
    )

    assert settings.allowed_origins == ("http://localhost:3000", "https://example.com")
