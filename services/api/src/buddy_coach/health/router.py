"""Health endpoints for load balancers and orchestrators."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response, status

from buddy_coach import __version__
from buddy_coach.core.db import Database

router = APIRouter(prefix="/health", tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/live")
async def live() -> dict[str, str]:
    """The process is up."""
    return {"status": "ok", "version": __version__}


@router.get("/ready")
async def ready(request: Request, response: Response) -> dict[str, str]:
    """The app can serve traffic: the database answers."""
    database: Database = request.app.state.db
    try:
        await database.ping()
    except Exception:
        logger.exception("readiness_check_failed")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "database": "down"}
    return {"status": "ok", "database": "up"}
