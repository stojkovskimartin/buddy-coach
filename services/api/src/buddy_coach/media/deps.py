"""Dependencies for the media module."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.config import Settings
from buddy_coach.core.db import get_session
from buddy_coach.core.deps import Clock, get_app_settings, get_clock, get_event_bus
from buddy_coach.core.events import EventBus
from buddy_coach.media.service import PhotoService
from buddy_coach.media.storage import LocalPhotoStorage, PhotoStorage
from buddy_coach.profile.service import ProfileService


def get_photo_storage(settings: Annotated[Settings, Depends(get_app_settings)]) -> PhotoStorage:
    """The photo storage of this deployment (local disk for now)."""
    return LocalPhotoStorage(settings.media_dir)


def get_photo_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    events: Annotated[EventBus, Depends(get_event_bus)],
    clock: Annotated[Clock, Depends(get_clock)],
    storage: Annotated[PhotoStorage, Depends(get_photo_storage)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> PhotoService:
    """Build the photo service for one request."""
    return PhotoService(
        session,
        storage,
        ProfileService(session, events),
        now=clock,
        meal_retention_days=settings.meal_photo_retention_days,
    )


PhotoServiceDep = Annotated[PhotoService, Depends(get_photo_service)]
