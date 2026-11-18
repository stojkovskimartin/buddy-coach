"""Persistence for daily check-ins."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.checkin.models import DailyCheckin


class CheckinRepository:
    """Data access for check-ins. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(
        self, user_id: uuid.UUID, day: date, values: dict[str, object]
    ) -> DailyCheckin:
        """Insert or replace the check-in of one day atomically."""
        statement = (
            insert(DailyCheckin)
            .values(user_id=user_id, day=day, **values)
            .on_conflict_do_update(
                index_elements=[DailyCheckin.user_id, DailyCheckin.day],
                set_={**values, "updated_at": func.now()},
            )
            .returning(DailyCheckin)
        )
        result = await self._session.execute(
            statement, execution_options={"populate_existing": True}
        )
        checkin: DailyCheckin = result.scalar_one()
        return checkin

    async def get(self, user_id: uuid.UUID, day: date) -> DailyCheckin | None:
        """The check-in of one day."""
        return await self._session.get(DailyCheckin, (user_id, day))

    async def between(self, user_id: uuid.UUID, start: date, end: date) -> Sequence[DailyCheckin]:
        """Check-ins from ``start`` to ``end`` inclusive, newest first."""
        result = await self._session.execute(
            select(DailyCheckin)
            .where(
                DailyCheckin.user_id == user_id,
                DailyCheckin.day >= start,
                DailyCheckin.day <= end,
            )
            .order_by(DailyCheckin.day.desc())
        )
        return result.scalars().all()
