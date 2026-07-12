from asyncio import Lock
from collections import defaultdict, deque
from time import monotonic
from uuid import UUID

from douga.core.config import get_settings
from douga.core.errors import ApplicationError


class ApiTokenRateLimiter:
    def __init__(self) -> None:
        self._requests: dict[tuple[str, UUID], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    async def check(self, token_id: UUID, user_id: UUID) -> None:
        now = monotonic()
        keys = (("token", token_id), ("user", user_id))
        async with self._lock:
            limit = get_settings().api_token_rate_limit_per_minute
            for key in keys:
                requests = self._requests[key]
                while requests and requests[0] <= now - 60:
                    requests.popleft()
                if len(requests) >= limit:
                    raise ApplicationError("RATE_LIMITED", "errors.rateLimited", 429)
            for key in keys:
                self._requests[key].append(now)


api_token_rate_limiter = ApiTokenRateLimiter()
