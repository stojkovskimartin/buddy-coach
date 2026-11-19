"""HTTP endpoints for nutrition."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status

from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.nutrition.deps import NutritionServiceDep
from buddy_coach.nutrition.schemas import TargetsOut

router = APIRouter(prefix="/nutrition", tags=["nutrition"])

# FastAPI types `responses` as dict[int | str, dict[str, Any]]; the values are OpenAPI snippets.
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "No profile yet (complete onboarding first)"}
}


@router.get("/targets/today", response_model=TargetsOut, responses=_NOT_FOUND)
async def targets_today(current: CurrentUserDep, service: NutritionServiceDep) -> TargetsOut:
    """Today's calories and macros from the athlete's profile and main goal."""
    return await service.targets_today(current.id)
