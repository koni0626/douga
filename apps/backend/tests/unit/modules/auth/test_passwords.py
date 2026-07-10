from douga.modules.auth.passwords import password_service
from douga.modules.auth.service import hash_token, normalize_email


def test_password_is_argon2id_hashed_and_verifiable() -> None:
    password = "correct horse battery staple"
    password_hash = password_service.hash(password)

    assert password not in password_hash
    assert password_hash.startswith("$argon2id$")
    assert password_service.verify(password_hash, password)
    assert not password_service.verify(password_hash, "wrong password")


def test_normalization_and_token_hash_are_deterministic() -> None:
    assert normalize_email("  USER@Example.COM ") == "user@example.com"
    assert hash_token("secret") == hash_token("secret")
    assert hash_token("secret") != hash_token("other")
