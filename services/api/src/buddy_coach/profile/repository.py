"""Persistence for profiles and goals."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select, update
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

    async def save_profile(self, profile: Profile) -> Profile:
        """Insert or update a profile."""
        merged = await self._session.merge(profile)
        await self._session.flush()
        return merged

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
