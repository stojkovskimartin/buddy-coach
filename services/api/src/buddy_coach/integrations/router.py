"""HTTP endpoints for directly connected accounts."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from buddy_coach.identity.deps import CurrentUserDep
from buddy_coach.integrations.deps import IntegrationsServiceDep
from buddy_coach.integrations.domain import Provider
from buddy_coach.integrations.schemas import AuthorizeOut, CallbackIn, ProviderOut, SyncOut

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("", response_model=list[ProviderOut])
async def list_providers(
    current: CurrentUserDep, service: IntegrationsServiceDep
) -> list[ProviderOut]:
    """Accounts that can be connected, and which are."""
    return await service.providers(current.id)


@router.post("/{provider}/connect", response_model=AuthorizeOut)
async def connect(
    provider: Provider, current: CurrentUserDep, service: IntegrationsServiceDep
) -> AuthorizeOut:
    """Start connecting: send the browser to ``authorize_url``. The provider returns to the web
    app's /connections/callback page, which posts the code to ``/callback``."""
    return AuthorizeOut(authorize_url=service.authorize_url(current.id, provider))


@router.post("/{provider}/callback", response_model=SyncOut)
async def callback(
    provider: Provider, body: CallbackIn, current: CurrentUserDep, service: IntegrationsServiceDep
) -> SyncOut:
    """Finish connecting (only the user who started it can) and bring in the last year."""
    return await service.finish(current.id, provider, body.code, body.state)


@router.post("/{provider}/sync", response_model=SyncOut)
async def sync(
    provider: Provider, current: CurrentUserDep, service: IntegrationsServiceDep
) -> SyncOut:
    """Bring in new weigh-ins. At most once every 10 minutes; earlier calls return
    ``synced: false``."""
    return await service.sync(current.id, provider)


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    provider: Provider, current: CurrentUserDep, service: IntegrationsServiceDep
) -> Response:
    """Disconnect. Weights already brought in stay."""
    await service.disconnect(current.id, provider)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
