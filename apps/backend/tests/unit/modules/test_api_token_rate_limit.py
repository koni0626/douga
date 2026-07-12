from types import SimpleNamespace
from uuid import uuid4

import pytest
from douga.core.errors import ApplicationError
from douga.modules.api_tokens import rate_limit


async def test_api_token_rate_limit_applies_to_token_and_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: SimpleNamespace(api_token_rate_limit_per_minute=2),
    )
    limiter = rate_limit.ApiTokenRateLimiter()
    user_id = uuid4()

    await limiter.check(uuid4(), user_id)
    await limiter.check(uuid4(), user_id)
    with pytest.raises(ApplicationError) as error:
        await limiter.check(uuid4(), user_id)
    assert error.value.code == "RATE_LIMITED"

    other_user = uuid4()
    token_id = uuid4()
    await limiter.check(token_id, other_user)
    await limiter.check(token_id, uuid4())
    with pytest.raises(ApplicationError):
        await limiter.check(token_id, uuid4())
