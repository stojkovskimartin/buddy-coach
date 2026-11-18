"""Database engine, declarative base and request-scoped sessions."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import DateTime, MetaData, func, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import NullPool

# Deterministic constraint names keep Alembic migrations stable across environments.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def utcnow() -> datetime:
    """Timezone-aware current time in UTC."""
    return datetime.now(UTC)


class TimestampMixin:
    """Adds ``created_at`` and ``updated_at`` columns maintained by the database."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=utcnow, nullable=False
    )


class Database:
    """Owns the async engine and the session factory for one application instance."""

    def __init__(self, url: str, *, pool_size: int = 10, use_null_pool: bool = False) -> None:
        if use_null_pool:
            # Tests open a fresh connection per use so event loops never share connections.
            self.engine: AsyncEngine = create_async_engine(url, poolclass=NullPool)
        else:
            self.engine = create_async_engine(url, pool_size=pool_size, pool_pre_ping=True)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def ping(self) -> bool:
        """Return True if the database answers a trivial query."""
        async with self.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True

    async def dispose(self) -> None:
        """Close all pooled connections."""
        await self.engine.dispose()


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a session; services commit explicitly, failures roll back."""
    database: Database = request.app.state.db
    async with database.session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
