"""HTTP endpoints for photos. Uploads are the raw image bytes (no multipart), read with a hard
size cap while streaming, so an oversized upload never reaches memory or disk."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.core.db import get_session
from buddy_coach.core.errors import PayloadTooLargeError
from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.media.deps import PhotoServiceDep
from buddy_coach.media.domain import MAX_UPLOAD_BYTES, PhotoKind
from buddy_coach.media.schemas import PhotoOut
from buddy_coach.media.storage import Size

router = APIRouter(prefix="/photos", tags=["photos"])

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not yours or gone"}
}
_BINARY = {"schema": {"type": "string", "format": "binary"}}
_UPLOAD_BODY: dict[str, Any] = {
    "requestBody": {
        "required": True,
        "content": {"image/jpeg": _BINARY, "image/png": _BINARY, "image/webp": _BINARY},
    }
}
_TOO_LARGE = f"A photo can be at most {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."


async def _read_capped(request: Request) -> bytes:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError(_TOO_LARGE)
    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > MAX_UPLOAD_BYTES:
            raise PayloadTooLargeError(_TOO_LARGE)
        chunks.append(chunk)
    return b"".join(chunks)


@router.post(
    "",
    response_model=PhotoOut,
    status_code=status.HTTP_201_CREATED,
    openapi_extra=_UPLOAD_BODY,
    responses={status.HTTP_413_CONTENT_TOO_LARGE: {"description": _TOO_LARGE}},
)
async def upload_photo(
    request: Request,
    current: CurrentUserDep,
    service: PhotoServiceDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    kind: Annotated[PhotoKind, Query()],
) -> PhotoOut:
    """Upload a JPEG, PNG or WebP photo (max 10 MB). It is shrunk to 1280 px, stored without
    EXIF/GPS data, and a new avatar replaces the old one."""
    # The login check opened a transaction; end it so no database connection waits idle while
    # a slow upload streams in and the photo is processed.
    await session.commit()
    data = await _read_capped(request)
    return PhotoOut.model_validate(await service.upload(current.id, kind, data))


@router.get("", response_model=list[PhotoOut])
async def list_photos(
    current: CurrentUserDep,
    service: PhotoServiceDep,
    kind: Annotated[PhotoKind | None, Query()] = None,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> list[PhotoOut]:
    """Photos in a date range (default: the last 90 days), newest first. Max 366 days."""
    end = end or await service.today(current.id)
    start = start or end - timedelta(days=89)
    return [PhotoOut.model_validate(p) for p in await service.history(current.id, kind, start, end)]


@router.get(
    "/{photo_id}/image",
    responses={**_NOT_FOUND, status.HTTP_200_OK: {"content": {"image/jpeg": _BINARY}}},
    response_class=Response,
)
async def photo_image(
    photo_id: uuid.UUID,
    current: CurrentUserDep,
    service: PhotoServiceDep,
    size: Annotated[Size, Query()] = "full",
) -> Response:
    """The JPEG of a photo (1280 px, or a 320 px thumbnail). Never cached: photos are private."""
    content = await service.image(current.id, photo_id, size)
    return Response(
        content, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"}
    )


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_NOT_FOUND)
async def delete_photo(
    photo_id: uuid.UUID, current: CurrentUserDep, service: PhotoServiceDep
) -> Response:
    """Delete a photo and its files."""
    await service.delete(current.id, photo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
