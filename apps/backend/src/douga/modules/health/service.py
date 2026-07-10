from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class HealthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def check_database(self) -> None:
        await self.session.execute(text("SELECT 1"))
