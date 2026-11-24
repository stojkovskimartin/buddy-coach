"""HTTP endpoints for the data export and account deletion."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from buddy_coach.core.deps import Clock, get_clock
from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.identity.schemas import DeleteAccountIn
from buddy_coach.privacy.deps import PrivacyServiceDep
from buddy_coach.privacy.schemas import DataExport

router = APIRouter(tags=["privacy"])


@router.get(
    "/privacy/export",
    response_model=DataExport,
    responses={status.HTTP_200_OK: {"description": "Downloaded as a JSON file"}},
)
async def export_data(
    current: CurrentUserDep,
    service: PrivacyServiceDep,
    clock: Annotated[Clock, Depends(get_clock)],
) -> Response:
    """Everything stored about the account as one JSON file (photos as metadata only)."""
    now = clock()
    data = await service.export(current.id, now)
    filename = f"buddy-coach-export-{now.date().isoformat()}.json"
    return Response(
        content=data.model_dump_json(),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.post(
    "/account/delete",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={status.HTTP_403_FORBIDDEN: {"description": "Wrong password (invalid_password)"}},
)
async def delete_account(
    body: DeleteAccountIn, current: CurrentUserDep, service: PrivacyServiceDep
) -> Response:
    """Delete the account and all its data for good. Needs the current password."""
    await service.delete_account(current.id, body.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
