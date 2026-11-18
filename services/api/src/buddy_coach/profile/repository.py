"""Persistence for profiles and goals."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.profile.domain import GoalPriority, GoalStatus
from buddy_coach.profile.models import Goal, Profile


class ProfileRepository:
    """Data access for the profile module. Callers own the transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_profile(self, user_id: uuid.UUID) -> Profile | None:
        """Return the profile of a user."""
        return await self._session.get(Profile, user_id)

    async def upsert_profile(self, user_id: uuid.UUID, values: dict[str, object]) -> Profile:
        """Insert or update atomically (safe when two first-time saves race)."""
        insert_stmt = insert(Profile).values(user_id=user_id, **values)
        upsert = insert_stmt.on_conflict_do_update(
            index_elements=[Profile.user_id],
            set_={**values, "updated_at": func.now()},
        ).returning(Profile)
        result = await self._session.execute(upsert, execution_options={"populate_existing": True})
        profile: Profile = result.scalar_one()
        return profile

    async def lock_goals(self, user_id: uuid.UUID) -> None:
        """Serialise goal changes of one user until the transaction ends.

        A row lock is not enough: with no goals yet there is no row to lock.
        """
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"profile_goals:{user_id}"},
        )

    async def list_goals(self, user_id: uuid.UUID, status: GoalStatus | None) -> Sequence[Goal]:
        """Goals of a user, newest first, optionally filtered by status."""
        query = select(Goal).where(Goal.user_id == user_id)
        if status is not None:
            query = query.where(Goal.status == status)
        result = await self._session.execute(query.order_by(Goal.created_at.desc()))
        return result.scalars().all()

    async def get_goal(self, user_id: uuid.UUID, goal_id: uuid.UUID) -> Goal | None:
        """A goal, only if it belongs to the user."""
        result = await self._session.execute(
            select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def add_goal(self, goal: Goal) -> Goal:
        """Insert a goal."""
        self._session.add(goal)
        await self._session.flush()
        return goal

    async def demote_active_primary(self, user_id: uuid.UUID) -> None:
        """Make the current active primary goal secondary."""
        await self._session.execute(
            update(Goal)
            .where(
                Goal.user_id == user_id,
                Goal.priority == GoalPriority.PRIMARY,
                Goal.status == GoalStatus.ACTIVE,
            )
            .values(priority=GoalPriority.SECONDARY)
        )
