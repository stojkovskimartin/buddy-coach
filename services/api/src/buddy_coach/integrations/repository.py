"""Persistence for connections."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.integrations.domain import Provider
from buddy_coach.integrations.models import Connection


class ConnectionRepository:
    """Data access for connections. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(
        self, user_id: uuid.UUID, provider: Provider, *, lock: bool = False
    ) -> Connection | None:
        """The connection, locked until the transaction ends when ``lock`` is set (one sync and
        one token refresh at a time)."""
        query = select(Connection).where(
            Connection.user_id == user_id, Connection.provider == provider
        )
        if lock:
            query = query.with_for_update()
        return (await self._session.execute(query)).scalar_one_or_none()

    async def list(self, user_id: uuid.UUID) -> Sequence[Connection]:
        """All connections of a user."""
        query = select(Connection).where(Connection.user_id == user_id)
        return (await self._session.execute(query)).scalars().all()

    def add(self, connection: Connection) -> None:
        """Stage a new connection."""
        self._session.add(connection)

    async def remove(self, connection: Connection) -> None:
        """Delete a connection."""
        await self._session.delete(connection)
