from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from douga.core.config import get_settings


def create_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
        echo=settings.app_env == "development",
    )


engine = create_engine()
