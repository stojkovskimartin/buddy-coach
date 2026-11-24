"""Persistence for users and refresh tokens."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.identity.models import RefreshToken, User


class IdentityRepository:
    """Data access for the identity module. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_user(self, user_id: uuid.UUID) -> User | None:
        """Return a user by id."""
        return await self._session.get(User, user_id)

    async def get_user_by_email(self, email: str) -> User | None:
        """Return a user by normalised email."""
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def add_user(self, email: str, password_hash: str) -> User:
        """Insert a user and flush to get its id."""
        user = User(email=email, password_hash=password_hash)
        self._session.add(user)
        await self._session.flush()
        return user

    async def add_refresh_token(
        self, user_id: uuid.UUID, jti_hash: str, expires_at: datetime
    ) -> None:
        """Store a newly issued refresh token."""
        self._session.add(RefreshToken(user_id=user_id, jti_hash=jti_hash, expires_at=expires_at))
        await self._session.flush()

    async def get_refresh_token(self, jti_hash: str) -> RefreshToken | None:
        """Return a refresh token by the hash of its id, locked for update."""
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.jti_hash == jti_hash).with_for_update()
        )
        return result.scalar_one_or_none()

    async def revoke_all_for_user(
        self, user_id: uuid.UUID, at: datetime, reason: str = "reuse"
    ) -> None:
        """Revoke every active refresh token of a user (token reuse, account deletion)."""
        await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=at, revoked_reason=reason)
        )

    async def erase(self, user_id: uuid.UUID) -> None:
        """Delete the user's refresh tokens and the account itself."""
        await self._session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
        await self._session.execute(delete(User).where(User.id == user_id))
