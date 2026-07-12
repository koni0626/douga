import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_SECRET_KEY", "test-secret-key-with-at-least-32-characters")
os.environ.setdefault("ASSISTANT_PROVIDER", "fake")
os.environ.setdefault("AUTH_RATE_LIMIT_PER_MINUTE", "1000")
