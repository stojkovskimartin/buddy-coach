"""Identity use cases: register, login, refresh with rotation, logout."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.config import Settings
from buddy_coach.core.errors import AuthenticationError, ConflictError, NotFoundError
from buddy_coach.core.events import EventBus
from buddy_coach.core.security import (
    DUMMY_PASSWORD_HASH,
    TokenType,
    create_token,
    decode_token,
    hash_password,
    password_needs_rehash,
    sha256_hex,
    verify_password,
)
from buddy_coach.identity.events import UserRegistered
from buddy_coach.identity.models import User
from buddy_coach.identity.repository import IdentityRepository
from buddy_coach.identity.schemas import CurrentUser, TokenPair

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = "Email or password is incorrect."
# Mobile apps often fire two refreshes at once on resume. A token revoked this recently is
# treated as that race, not as theft (same idea as a "reuse interval" in common IdPs).
REFRESH_REUSE_GRACE = timedelta(seconds=10)


def normalise_email(email: str) -> str:
    """Emails are compared case-insensitively and without surrounding spaces."""
    return email.strip().lower()


class IdentityService:
    """Account and token use cases. Commits its own transactions."""

    def __init__(self, session: AsyncSession, settings: Settings, events: EventBus) -> None:
        self._session = session
        self._repo = IdentityRepository(session)
        self._settings = settings
        self._events = events

    async def register(self, email: str, password: str) -> User:
        """Create an account. Raises ConflictError if the email is taken."""
        normalised = normalise_email(email)
        if await self._repo.get_user_by_email(normalised) is not None:
            raise ConflictError("An account with this email already exists.")
        try:
            user = await self._repo.add_user(normalised, hash_password(password))
            await self._session.commit()
        except IntegrityError as exc:  # concurrent registration with the same email
            await self._session.rollback()
            raise ConflictError("An account with this email already exists.") from exc
        await self._events.publish(UserRegistered(user_id=user.id))
        logger.info("user_registered", extra={"user_id": str(user.id)})
        return user

    async def login(self, email: str, password: str) -> TokenPair:
        """Verify credentials and issue a token pair."""
        user = await self._repo.get_user_by_email(normalise_email(email))
        if user is None:
            verify_password(password, DUMMY_PASSWORD_HASH)  # equalise timing
            raise AuthenticationError(INVALID_CREDENTIALS)
        if not verify_password(password, user.password_hash) or not user.is_active:
            raise AuthenticationError(INVALID_CREDENTIALS)
        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
        pair = await self._issue_pair(user.id)
        await self._session.commit()
        return pair

    async def refresh(self, refresh_token: str) -> TokenPair:
        """Rotate a refresh token. Reusing a revoked token revokes the whole family."""
        claims = decode_token(refresh_token, TokenType.REFRESH, self._settings)
        stored = await self._repo.get_refresh_token(sha256_hex(claims.jti))
        now = datetime.now(UTC)
        if stored is None or stored.user_id != claims.subject:
            raise AuthenticationError("Refresh token is not recognised.")
        in_grace = (
            stored.revoked_reason == "rotated"
            and stored.revoked_at is not None
            and now - stored.revoked_at <= REFRESH_REUSE_GRACE
        )
        if stored.revoked_at is not None and not in_grace:
            # A revoked token being used again later means it was probably stolen.
            await self._repo.revoke_all_for_user(stored.user_id, now)
            await self._session.commit()
            logger.warning("refresh_token_reuse", extra={"user_id": str(stored.user_id)})
            raise AuthenticationError("Refresh token has been revoked.")
        if stored.expires_at <= now:
            raise AuthenticationError("Refresh token has expired.")
        user = await self._repo.get_user(stored.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Account is not active.")
        if stored.revoked_at is None:
            stored.revoked_at = now
            stored.revoked_reason = "rotated"
        pair = await self._issue_pair(user.id)
        await self._session.commit()
        return pair

    async def logout(self, refresh_token: str) -> None:
        """Revoke a refresh token. Unknown or already revoked tokens are ignored."""
        try:
            claims = decode_token(refresh_token, TokenType.REFRESH, self._settings)
        except AuthenticationError:
            return
        stored = await self._repo.get_refresh_token(sha256_hex(claims.jti))
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
            stored.revoked_reason = "logout"
            await self._session.commit()

    async def authenticate_access_token(self, token: str) -> CurrentUser:
        """Resolve an access token to the current user."""
        claims = decode_token(token, TokenType.ACCESS, self._settings)
        user = await self._repo.get_user(claims.subject)
        if user is None or not user.is_active:
            raise AuthenticationError("Account is not active.")
        return CurrentUser(id=user.id, email=user.email)

    async def get_user(self, user_id: uuid.UUID) -> User:
        """Return a user or raise NotFoundError."""
        user = await self._repo.get_user(user_id)
        if user is None:
            raise NotFoundError("User not found.")
        return user

    async def _issue_pair(self, user_id: uuid.UUID) -> TokenPair:
        access, _ = create_token(user_id, TokenType.ACCESS, self._settings)
        refresh, refresh_claims = create_token(user_id, TokenType.REFRESH, self._settings)
        await self._repo.add_refresh_token(
            user_id, sha256_hex(refresh_claims.jti), refresh_claims.expires_at
        )
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=self._settings.access_token_ttl_minutes * 60,
        )
