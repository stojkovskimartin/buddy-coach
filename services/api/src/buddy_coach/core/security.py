"""Password hashing (Argon2id) and JSON Web Tokens."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from buddy_coach.core.config import Settings
from buddy_coach.core.errors import AuthenticationError

_hasher = PasswordHasher()

# A valid hash for a random password, verified when a user does not exist so that
# login takes the same time either way (prevents user enumeration by timing).
DUMMY_PASSWORD_HASH = _hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    """Hash a password with Argon2id."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Return True if the password matches the hash. Never raises for a wrong password."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    """True when the hash was made with outdated parameters."""
    return _hasher.check_needs_rehash(password_hash)


def sha256_hex(value: str) -> str:
    """Hex SHA-256, used to store token identifiers without storing the tokens."""
    return hashlib.sha256(value.encode()).hexdigest()


class TokenType(StrEnum):
    """Kinds of JWT issued by the API."""

    ACCESS = "access"
    REFRESH = "refresh"


@dataclass(frozen=True, slots=True)
class TokenClaims:
    """Validated claims of a decoded token."""

    subject: uuid.UUID
    token_type: TokenType
    jti: str
    expires_at: datetime


def create_token(
    subject: uuid.UUID, token_type: TokenType, settings: Settings, *, now: datetime | None = None
) -> tuple[str, TokenClaims]:
    """Create a signed token and return it with its claims."""
    issued = now or datetime.now(UTC)
    ttl = (
        timedelta(minutes=settings.access_token_ttl_minutes)
        if token_type is TokenType.ACCESS
        else timedelta(days=settings.refresh_token_ttl_days)
    )
    claims = TokenClaims(
        subject=subject,
        token_type=token_type,
        jti=secrets.token_urlsafe(16),
        expires_at=issued + ttl,
    )
    payload = {
        "sub": str(subject),
        "typ": token_type.value,
        "jti": claims.jti,
        "iat": int(issued.timestamp()),
        "exp": int(claims.expires_at.timestamp()),
    }
    token = jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )
    return token, claims


def decode_token(token: str, expected_type: TokenType, settings: Settings) -> TokenClaims:
    """Verify signature, expiry and type. Raises AuthenticationError on any problem."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "typ", "jti", "exp", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token has expired.") from exc
    except jwt.PyJWTError as exc:
        raise AuthenticationError("Token is invalid.") from exc

    if payload.get("typ") != expected_type.value:
        raise AuthenticationError("Wrong token type.")
    try:
        subject = uuid.UUID(str(payload["sub"]))
    except ValueError as exc:
        raise AuthenticationError("Token is invalid.") from exc
    return TokenClaims(
        subject=subject,
        token_type=expected_type,
        jti=str(payload["jti"]),
        expires_at=datetime.fromtimestamp(int(payload["exp"]), UTC),
    )
