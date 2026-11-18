"""Public request/response models of the identity module."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128


class RegisterRequest(BaseModel):
    """Create an account."""

    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class LoginRequest(BaseModel):
    """Exchange credentials for tokens."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class RefreshRequest(BaseModel):
    """Exchange a refresh token for a new token pair (the old one is revoked)."""

    refresh_token: str = Field(min_length=1, max_length=2048)


class TokenPair(BaseModel):
    """Access and refresh tokens returned after login or refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105  # OAuth2 token type, not a secret
    expires_in: int = Field(description="Access token lifetime in seconds")


class UserOut(BaseModel):
    """Account data safe to return to its owner."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    is_active: bool
    created_at: datetime


@dataclass(frozen=True, slots=True)
class CurrentUser:
    """The authenticated caller. Other modules depend on this, never on the User table."""

    id: uuid.UUID
    email: str
