"""Tables owned by the media module (no foreign keys to other modules, ADR-0002)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, Enum, Index, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from buddy_coach.core.db import Base, TimestampMixin
from buddy_coach.media.domain import PhotoKind


class Photo(TimestampMixin, Base):
    """A stored photo; the image files are in the photo storage, not in the database."""

    __tablename__ = "media_photos"
    __table_args__ = (Index("ix_media_photos_user_kind_day", "user_id", "kind", "day"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    kind: Mapped[PhotoKind] = mapped_column(
        Enum(
            PhotoKind,
            name="photo_kind",
            native_enum=False,
            length=32,
            values_callable=lambda cls: [str(m.value) for m in cls],
        )
    )
    day: Mapped[date] = mapped_column(Date, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
