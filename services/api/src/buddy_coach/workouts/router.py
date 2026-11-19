"""HTTP endpoints for workouts and training load."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.workouts.deps import WorkoutServiceDep
from buddy_coach.workouts.schemas import (
    FeedbackIn,
    ImportIn,
    ImportResult,
    LoadOut,
    WorkoutData,
    WorkoutOut,
)

router = APIRouter(tags=["workouts"])

# FastAPI types `responses` as dict[int | str, dict[str, Any]]; the values are OpenAPI snippets.
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not yours or gone"}
}


@router.post("/workouts/import", response_model=ImportResult)
async def import_workouts(
    body: ImportIn, current: CurrentUserDep, service: WorkoutServiceDep
) -> ImportResult:
    """Sync workouts from a device or app. Safe to repeat: known workouts are updated."""
    return await service.import_workouts(current.id, body.workouts)


@router.post("/workouts", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
async def log_workout(
    body: WorkoutData, current: CurrentUserDep, service: WorkoutServiceDep
) -> WorkoutOut:
    """Log a session by hand."""
    return WorkoutOut.model_validate(await service.log_workout(current.id, body))


@router.get("/workouts", response_model=list[WorkoutOut])
async def list_workouts(
    current: CurrentUserDep,
    service: WorkoutServiceDep,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> list[WorkoutOut]:
    """Workouts in a date range (default: the last 28 days), newest first. Max 366 days."""
    end = end or await service.today(current.id)
    start = start or end - timedelta(days=27)
    return [WorkoutOut.model_validate(w) for w in await service.history(current.id, start, end)]


@router.patch("/workouts/{workout_id}/feedback", response_model=WorkoutOut, responses=_NOT_FOUND)
async def give_feedback(
    workout_id: uuid.UUID, body: FeedbackIn, current: CurrentUserDep, service: WorkoutServiceDep
) -> WorkoutOut:
    """How the session felt (effort, feeling, pain); updates its load."""
    return WorkoutOut.model_validate(await service.give_feedback(current.id, workout_id, body))


@router.delete(
    "/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND
)
async def delete_workout(
    workout_id: uuid.UUID, current: CurrentUserDep, service: WorkoutServiceDep
) -> Response:
    """Delete a workout."""
    await service.delete(current.id, workout_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/training/load", response_model=LoadOut)
async def training_load(
    current: CurrentUserDep,
    service: WorkoutServiceDep,
    days: Annotated[int, Query(ge=7, le=366)] = 42,
) -> LoadOut:
    """Fitness, fatigue and form for the last ``days`` days, and this week's ramp check."""
    return await service.load(current.id, days)
