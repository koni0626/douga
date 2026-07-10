from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError


class PasswordService:
    def __init__(self) -> None:
        self._hasher = PasswordHasher()

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._hasher.verify(password_hash, password)
        except InvalidHashError, VerifyMismatchError:
            return False


password_service = PasswordService()
DUMMY_PASSWORD_HASH = password_service.hash("not-a-real-user-password")
