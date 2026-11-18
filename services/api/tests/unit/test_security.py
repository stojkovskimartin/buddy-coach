from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from buddy_coach.core.errors import AuthenticationError
from buddy_coach.core.security import (
    TokenType,
    create_token,
    decode_token,
    hash_password,
    password_needs_rehash,
    sha256_hex,
    verify_password,
)
from tests.support import make_settings


def test_hash_and_verify_password() -> None:
    hashed = hash_password("a-long-password")
    assert hashed != "a-long-password"
    assert verify_password("a-long-password", hashed)
    assert not verify_password("wrong-password", hashed)
    assert not password_needs_rehash(hashed)


def test_verify_password_with_garbage_hash_returns_false() -> None:
    assert not verify_password("anything", "not-a-hash")


def test_sha256_hex_is_stable() -> None:
    assert sha256_hex("abc") == sha256_hex("abc")
    assert len(sha256_hex("abc")) == 64


def test_token_round_trip() -> None:
    settings = make_settings()
    user_id = uuid.uuid4()
    token, claims = create_token(user_id, TokenType.ACCESS, settings)
    decoded = decode_token(token, TokenType.ACCESS, settings)
    assert decoded.subject == user_id
    assert decoded.jti == claims.jti
    assert decoded.token_type is TokenType.ACCESS


def test_refresh_token_lives_longer_than_access_token() -> None:
    settings = make_settings()
    _, access = create_token(uuid.uuid4(), TokenType.ACCESS, settings)
    _, refresh = create_token(uuid.uuid4(), TokenType.REFRESH, settings)
    assert refresh.expires_at - access.expires_at > timedelta(days=1)


def test_wrong_token_type_is_rejected() -> None:
    settings = make_settings()
    token, _ = create_token(uuid.uuid4(), TokenType.REFRESH, settings)
    with pytest.raises(AuthenticationError, match="Wrong token type"):
        decode_token(token, TokenType.ACCESS, settings)


def test_expired_token_is_rejected() -> None:
    settings = make_settings()
    past = datetime.now(UTC) - timedelta(hours=2)
    token, _ = create_token(uuid.uuid4(), TokenType.ACCESS, settings, now=past)
    with pytest.raises(AuthenticationError, match="expired"):
        decode_token(token, TokenType.ACCESS, settings)


def test_token_signed_with_other_secret_is_rejected() -> None:
    token, _ = create_token(uuid.uuid4(), TokenType.ACCESS, make_settings())
    other = make_settings(jwt_secret="another-secret-" + "y" * 40)
    with pytest.raises(AuthenticationError, match="invalid"):
        decode_token(token, TokenType.ACCESS, other)


def test_token_with_none_algorithm_is_rejected() -> None:
    settings = make_settings()
    forged = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "typ": "access",
            "jti": "x",
            "iss": "buddy-coach",
            "aud": "buddy-coach-api",
            "iat": 0,
            "exp": 9_999_999_999,
        },
        key=None,
        algorithm="none",
    )
    with pytest.raises(AuthenticationError):
        decode_token(forged, TokenType.ACCESS, settings)


def test_token_with_non_uuid_subject_is_rejected() -> None:
    settings = make_settings()
    now = int(datetime.now(UTC).timestamp())
    token = jwt.encode(
        {
            "sub": "not-a-uuid",
            "typ": "access",
            "jti": "x",
            "iss": "buddy-coach",
            "aud": "buddy-coach-api",
            "iat": now,
            "exp": now + 60,
        },
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    with pytest.raises(AuthenticationError):
        decode_token(token, TokenType.ACCESS, settings)


def test_token_for_other_audience_is_rejected() -> None:
    token, _ = create_token(uuid.uuid4(), TokenType.ACCESS, make_settings())
    other = make_settings(jwt_audience="another-service")
    with pytest.raises(AuthenticationError, match="invalid"):
        decode_token(token, TokenType.ACCESS, other)
