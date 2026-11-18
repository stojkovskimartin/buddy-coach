"""HTTP endpoints for the profile and goals."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.profile.deps import ProfileServiceDep
from buddy_coach.profile.domain import GoalStatus
from buddy_coach.profile.schemas import GoalIn, GoalOut, GoalStatusUpdate, ProfileIn, ProfileOut

router = APIRouter(tags=["profile"])


@router.get("/profile", response_model=ProfileOut)
async def get_profile(current: CurrentUserDep, service: ProfileServiceDep) -> ProfileOut:
    """Return the caller's profile."""
    return ProfileOut.model_validate(await service.get_profile(current.id))


@router.put("/profile", response_model=ProfileOut)
async def put_profile(
    body: ProfileIn, current: CurrentUserDep, service: ProfileServiceDep
) -> ProfileOut:
    """Create or replace the caller's profile."""
    return ProfileOut.model_validate(await service.upsert_profile(current.id, body))


@router.get("/goals", response_model=list[GoalOut], tags=["goals"])
async def list_goals(
    current: CurrentUserDep, service: ProfileServiceDep, status: GoalStatus | None = None
) -> list[GoalOut]:
    """List the caller's goals, newest first."""
    goals = await service.list_goals(current.id, status)
    return [GoalOut.model_validate(goal) for goal in goals]


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED, tags=["goals"])
async def create_goal(body: GoalIn, current: CurrentUserDep, service: ProfileServiceDep) -> GoalOut:
    """Create a goal."""
    return GoalOut.model_validate(await service.create_goal(current.id, body))


@router.patch("/goals/{goal_id}", response_model=GoalOut, tags=["goals"])
async def update_goal_status(
    goal_id: uuid.UUID, body: GoalStatusUpdate, current: CurrentUserDep, service: ProfileServiceDep
) -> GoalOut:
    """Change a goal's status."""
    return GoalOut.model_validate(
        await service.update_goal_status(current.id, goal_id, body.status)
    )
