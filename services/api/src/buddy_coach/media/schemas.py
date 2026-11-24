"""Public response models of the media module."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from buddy_coach.media.domain import PhotoKind


class PhotoOut(BaseModel):
    """A stored photo; its image is at GET /photos/{id}/image."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: PhotoKind
    day: date
    width: int
    height: int
    created_at: datetime


class PhotoRecord(BaseModel):
    """A photo's metadata for the data export (the images are not included)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: PhotoKind
    day: date
    width: int
    height: int
