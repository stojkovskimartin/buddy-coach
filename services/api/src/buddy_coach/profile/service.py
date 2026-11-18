"""Profile and goal use cases."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.errors import NotFoundError
from buddy_coach.core.events import EventBus
from buddy_coach.profile.domain import (
    GoalPriority,
    GoalSpec,
    GoalStatus,
    validate_adult,
    validate_goal,
)
from buddy_coach.profile.events import GoalChanged, ProfileUpdated
from buddy_coach.profile.models import Goal, Profile
from buddy_coach.profile.repository import ProfileRepository
from buddy_coach.profile.schemas import GoalIn, ProfileIn


def _utc_today() -> date:
    return datetime.now(UTC).date()


class ProfileService:
    """Profile and goal use cases. Commits its own transactions."""

    def __init__(
        self,
        session: AsyncSession,
        events: EventBus,
        today: Callable[[], date] = _utc_today,
    ) -> None:
        self._session = session
        self._repo = ProfileRepository(session)
        self._events = events
        self._today = today

    async def get_profile(self, user_id: uuid.UUID) -> Profile:
        """The user's profile, or NotFoundError if onboarding has not created it yet."""
        profile = await self._repo.get_profile(user_id)
        if profile is None:
            raise NotFoundError("Profile not found. Complete onboarding first.")
        return profile

    async def find_profile(self, user_id: uuid.UUID) -> Profile | None:
        """The user's profile or None. Used by other modules that can work without it."""
        return await self._repo.get_profile(user_id)

    async def upsert_profile(self, user_id: uuid.UUID, data: ProfileIn) -> Profile:
        """Create or replace the profile."""
        validate_adult(data.birth_year, self._today())
        profile = await self._repo.save_profile(Profile(user_id=user_id, **data.model_dump()))
        await self._session.commit()
        await self._session.refresh(profile)
        await self._events.publish(ProfileUpdated(user_id=user_id))
        return profile

    async def list_goals(self, user_id: uuid.UUID, status: GoalStatus | None) -> Sequence[Goal]:
        """The user's goals."""
        return await self._repo.list_goals(user_id, status)

    async def create_goal(self, user_id: uuid.UUID, data: GoalIn) -> Goal:
        """Create a goal. A new primary goal demotes the previous primary to secondary."""
        profile = await self._repo.get_profile(user_id)
        spec = GoalSpec(
            goal_type=data.goal_type,
            sport=data.sport,
            target_weight_kg=data.target_weight_kg,
            target_date=data.target_date,
            event_distance_km=data.event_distance_km,
        )
        validate_goal(spec, self._today(), profile.weight_kg if profile else None)
        if data.priority is GoalPriority.PRIMARY:
            await self._repo.demote_active_primary(user_id)
        goal = await self._repo.add_goal(
            Goal(user_id=user_id, status=GoalStatus.ACTIVE, **data.model_dump())
        )
        await self._session.commit()
        await self._session.refresh(goal)
        await self._events.publish(GoalChanged(user_id=user_id, goal_id=goal.id))
        return goal

    async def update_goal_status(
        self, user_id: uuid.UUID, goal_id: uuid.UUID, status: GoalStatus
    ) -> Goal:
        """Mark a goal achieved, abandoned or active again."""
        goal = await self._repo.get_goal(user_id, goal_id)
        if goal is None:
            raise NotFoundError("Goal not found.")
        if status is GoalStatus.ACTIVE and goal.priority is GoalPriority.PRIMARY:
            await self._repo.demote_active_primary(user_id)
        goal.status = status
        await self._session.commit()
        await self._session.refresh(goal)
        await self._events.publish(GoalChanged(user_id=user_id, goal_id=goal.id))
        return goal
