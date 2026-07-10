from asyncio import Lock
from collections import defaultdict, deque
from time import monotonic

from fastapi import Request

from douga.core.config import get_settings
from douga.core.errors import ApplicationError


class AuthRateLimiter:
    def __init__(self) -> None:
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    async def check(self, request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        now = monotonic()
        async with self._lock:
            attempts = self._attempts[key]
            while attempts and attempts[0] <= now - 60:
                attempts.popleft()
            if len(attempts) >= get_settings().auth_rate_limit_per_minute:
                raise ApplicationError("RATE_LIMITED", "errors.rateLimited", 429)
            attempts.append(now)


auth_rate_limiter = AuthRateLimiter()
