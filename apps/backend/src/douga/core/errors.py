from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class ApplicationError(Exception):
    code: str
    message_key: str
    status_code: int = 400
    details: dict[str, Any] | None = None


class NotFoundError(ApplicationError):
    def __init__(self, code: str, message_key: str) -> None:
        super().__init__(code=code, message_key=message_key, status_code=404)


class ConflictError(ApplicationError):
    def __init__(self, code: str, message_key: str) -> None:
        super().__init__(code=code, message_key=message_key, status_code=409)


class UnauthorizedError(ApplicationError):
    def __init__(
        self, code: str = "AUTH_REQUIRED", message_key: str = "errors.authRequired"
    ) -> None:
        super().__init__(code=code, message_key=message_key, status_code=401)


class ForbiddenError(ApplicationError):
    def __init__(self, code: str, message_key: str) -> None:
        super().__init__(code=code, message_key=message_key, status_code=403)
