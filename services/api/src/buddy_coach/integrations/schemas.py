"""Public request/response models of the integrations module."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from buddy_coach.integrations.domain import Provider


class ProviderOut(BaseModel):
    """An account type: offered on this server (set up by the operator) and connected or not."""

    provider: Provider
    available: bool
    connected: bool
    last_sync_at: datetime | None


class AuthorizeOut(BaseModel):
    """Where to send the browser to sign in at the provider."""

    authorize_url: str


class CallbackIn(BaseModel):
    """What the provider sent back to the web app's callback page."""

    code: str = Field(min_length=1, max_length=512)
    state: str = Field(min_length=1, max_length=2048)


class SyncOut(BaseModel):
    """Weights brought in. ``synced`` is false when the last sync was under 10 minutes ago, or
    when the first sync right after connecting failed (the account is connected)."""

    synced: bool
    last_sync_at: datetime | None
    created: int
    updated: int
    skipped: int


class ConnectionRecord(BaseModel):
    """A connected account for the data export: never its tokens or sync cursor."""

    model_config = ConfigDict(from_attributes=True)

    provider: Provider
    created_at: datetime
    last_sync_at: datetime | None
