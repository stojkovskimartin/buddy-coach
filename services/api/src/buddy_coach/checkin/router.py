"""HTTP endpoints for daily check-ins."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from buddy_coach.checkin.deps import CheckinServiceDep
from buddy_coach.checkin.schemas import CheckinIn, CheckinOut
from buddy_coach.identity.deps import CurrentUserDep

router = APIRouter(prefix="/checkins", tags=["checkins"])


# FastAPI types `responses` as dict[int | str, dict[str, Any]]; the values are OpenAPI snippets.
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "No check-in for this day yet"}
}
_CREATED: dict[int | str, dict[str, Any]] = {
    status.HTTP_201_CREATED: {"model": CheckinOut, "description": "Created"}
}


@router.get("/today", response_model=CheckinOut, responses=_NOT_FOUND)
async def get_today(current: CurrentUserDep, service: CheckinServiceDep) -> CheckinOut:
    """Today's check-in (in the athlete's time zone); 404 until it is entered."""
    return await service.get(current.id, await service.local_today(current.id))


@router.put("/today", response_model=CheckinOut, responses=_CREATED)
async def put_today(
    body: CheckinIn, current: CurrentUserDep, service: CheckinServiceDep, response: Response
) -> CheckinOut:
    """Create (201) or replace (200) today's check-in. The server decides which day "today" is
    (the athlete's time zone), so a phone in another time zone cannot pick the wrong day."""
    checkin, created = await service.save(current.id, await service.local_today(current.id), body)
    if created:
        response.status_code = status.HTTP_201_CREATED
    return checkin


@router.get("", response_model=list[CheckinOut])
async def list_checkins(
    current: CurrentUserDep,
    service: CheckinServiceDep,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> list[CheckinOut]:
    """Check-ins in a date range (default: the last 14 days), newest first. Max 92 days."""
    end = end or await service.local_today(current.id)
    start = start or end - timedelta(days=13)
    return await service.history(current.id, start, end)


@router.get("/{day}", response_model=CheckinOut, responses=_NOT_FOUND)
async def get_checkin(day: date, current: CurrentUserDep, service: CheckinServiceDep) -> CheckinOut:
    """The check-in of one day."""
    return await service.get(current.id, day)


@router.put("/{day}", response_model=CheckinOut, responses=_CREATED)
async def put_checkin(
    day: date,
    body: CheckinIn,
    current: CurrentUserDep,
    service: CheckinServiceDep,
    response: Response,
) -> CheckinOut:
    """Create (201) or replace (200) the check-in of a day (today or up to 7 days late)."""
    checkin, created = await service.save(current.id, day, body)
    if created:
        response.status_code = status.HTTP_201_CREATED
    return checkin
