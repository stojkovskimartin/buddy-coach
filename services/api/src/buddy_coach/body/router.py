"""HTTP endpoints for body weight."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from buddy_coach.body.deps import BodyServiceDep
from buddy_coach.body.schemas import (
    WeightHistoryOut,
    WeightImportIn,
    WeightImportResult,
    WeightIn,
    WeightOut,
    WeightSourceOut,
)
from buddy_coach.identity.deps import CurrentUserDep

router = APIRouter(prefix="/body/weights", tags=["body"])

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not yours or gone"}
}


@router.post("", response_model=WeightOut, status_code=status.HTTP_201_CREATED)
async def log_weight(body: WeightIn, current: CurrentUserDep, service: BodyServiceDep) -> WeightOut:
    """Log a weight by hand. The newest weight also becomes the profile's weight."""
    return WeightOut.model_validate(await service.log_weight(current.id, body))


@router.post("/import", response_model=WeightImportResult)
async def import_weights(
    body: WeightImportIn, current: CurrentUserDep, service: BodyServiceDep
) -> WeightImportResult:
    """Sync smart-scale weights from Apple Health or Health Connect. Safe to repeat.

    Deletions in the phone's health store are not mirrored; delete here instead.
    """
    return await service.import_weights(current.id, body.weights)


@router.get("/sources", response_model=list[WeightSourceOut])
async def weight_sources(current: CurrentUserDep, service: BodyServiceDep) -> list[WeightSourceOut]:
    """Where the weights come from (smart scale via the phone, or typed in): count and latest."""
    return await service.sources(current.id)


@router.get("", response_model=WeightHistoryOut)
async def weight_history(
    current: CurrentUserDep,
    service: BodyServiceDep,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> WeightHistoryOut:
    """Weights and their 7-day trend in a date range (default: the last 90 days). Max 366 days."""
    end = end or await service.today(current.id)
    start = start or end - timedelta(days=89)
    return await service.history(current.id, start, end)


@router.delete("/{weight_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND)
async def delete_weight(
    weight_id: uuid.UUID, current: CurrentUserDep, service: BodyServiceDep
) -> Response:
    """Delete a measurement."""
    await service.delete(current.id, weight_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
