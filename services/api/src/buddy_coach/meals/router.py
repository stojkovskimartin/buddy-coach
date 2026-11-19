"""HTTP endpoints for the food diary."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.meals.deps import MealServiceDep
from buddy_coach.meals.schemas import DailyTotalsOut, MealDayOut, MealEntryIn, MealEntryOut

router = APIRouter(prefix="/meals", tags=["meals"])

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not yours or gone"}
}


@router.post("/entries", response_model=MealEntryOut, status_code=status.HTTP_201_CREATED)
async def log_meal(
    body: MealEntryIn, current: CurrentUserDep, service: MealServiceDep
) -> MealEntryOut:
    """Add a food and the nutrients of the portion eaten."""
    return MealEntryOut.model_validate(await service.log(current.id, body))


@router.get("/entries", response_model=MealDayOut)
async def meal_day(
    current: CurrentUserDep,
    service: MealServiceDep,
    day: Annotated[date | None, Query()] = None,
) -> MealDayOut:
    """One day of the diary (default: today in the athlete's time zone) with its totals."""
    return await service.day(current.id, day or await service.today(current.id))


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND)
async def delete_meal(
    entry_id: uuid.UUID, current: CurrentUserDep, service: MealServiceDep
) -> Response:
    """Delete a diary entry."""
    await service.delete(current.id, entry_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/daily", response_model=list[DailyTotalsOut])
async def daily_totals(
    current: CurrentUserDep,
    service: MealServiceDep,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> list[DailyTotalsOut]:
    """Calories and macros per day with entries (default: the last 28 days). Max 366 days."""
    end = end or await service.today(current.id)
    start = start or end - timedelta(days=27)
    return await service.daily_totals(current.id, start, end)
