"""Tables owned by the integrations module (no foreign keys to other modules, ADR-0002)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from buddy_coach.core.db import Base, TimestampMixin
from buddy_coach.integrations.domain import Provider


class Connection(TimestampMixin, Base):
    """A connected account. Tokens are stored encrypted (Fernet); ``cursor`` is the provider's
    "changed since" mark of the last complete sync."""

    __tablename__ = "integrations_connections"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_integrations_connections_user_provider"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    provider: Mapped[Provider] = mapped_column(
        Enum(
            Provider,
            name="integration_provider",
            native_enum=False,
            length=32,
            values_callable=lambda cls: [str(m.value) for m in cls],
        )
    )
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cursor: Mapped[int | None] = mapped_column(BigInteger)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
