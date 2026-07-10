from dataclasses import dataclass


@dataclass(slots=True)
class ApplicationError(Exception):
    code: str
    message_key: str
    status_code: int = 400


class NotFoundError(ApplicationError):
    def __init__(self, code: str, message_key: str) -> None:
        super().__init__(code=code, message_key=message_key, status_code=404)


class ConflictError(ApplicationError):
    def __init__(self, code: str, message_key: str) -> None:
        super().__init__(code=code, message_key=message_key, status_code=409)
