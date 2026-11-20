"""Connection use cases: connect with OAuth, sync, disconnect.

Tokens are encrypted at rest. A sync claims the connection under a row lock (so two syncs never
refresh the same token), commits the claim and any rotated token at once, and saves the cursor
only after every page was imported.
"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from typing import Protocol

import jwt
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.body.domain import MAX_IMPORT_BATCH as MAX_WEIGHTS
from buddy_coach.body.schemas import ImportedWeight, WeightImportResult
from buddy_coach.core.config import Settings
from buddy_coach.core.deps import Clock
from buddy_coach.core.errors import NotFoundError, ValidationFailedError
from buddy_coach.integrations.clients import ProviderClient, Tokens
from buddy_coach.integrations.domain import (
    REFRESH_MARGIN,
    SYNC_INTERVAL,
    Provider,
    ProviderError,
    ReconnectRequiredError,
    SyncCounts,
)
from buddy_coach.integrations.models import Connection
from buddy_coach.integrations.repository import ConnectionRepository
from buddy_coach.integrations.schemas import ProviderOut, SyncOut
from buddy_coach.workouts.domain import MAX_IMPORT_BATCH as MAX_WORKOUTS
from buddy_coach.workouts.schemas import ImportedWorkout, ImportResult

STATE_AUDIENCE = "buddy-coach-oauth-state"
STATE_TTL = timedelta(minutes=10)


class WeightImporter(Protocol):
    """What the integrations module needs from the body module."""

    async def import_weights(
        self, user_id: uuid.UUID, weights: Sequence[ImportedWeight]
    ) -> WeightImportResult: ...


class WorkoutImporter(Protocol):
    """What the integrations module needs from the workouts module."""

    async def import_workouts(
        self, user_id: uuid.UUID, workouts: Sequence[ImportedWorkout]
    ) -> ImportResult: ...


class IntegrationsService:
    """Commits its own transactions."""

    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        clients: Mapping[Provider, ProviderClient],
        weights: WeightImporter,
        workouts: WorkoutImporter,
        now: Clock,
    ) -> None:
        self._session = session
        self._repo = ConnectionRepository(session)
        self._settings = settings
        self._clients = clients
        self._weights = weights
        self._workouts = workouts
        self._now = now
        key = settings.integrations_key
        self._fernet = Fernet(key.get_secret_value()) if key else None

    async def providers(self, user_id: uuid.UUID) -> list[ProviderOut]:
        """Every provider, whether this server offers it and whether it is connected."""
        connected = {c.provider: c for c in await self._repo.list(user_id)}
        return [
            ProviderOut(
                provider=p,
                available=self._available(p) is not None,
                connected=p in connected,
                last_sync_at=connected[p].last_sync_at if p in connected else None,
            )
            for p in Provider
        ]

    def authorize_url(self, user_id: uuid.UUID, provider: Provider) -> str:
        """The provider's consent page; ``state`` binds the answer to this user for 10 minutes."""
        return self._client(provider).authorize_url(self._state(user_id, provider))

    async def finish(
        self, user_id: uuid.UUID, provider: Provider, code: str, state: str
    ) -> SyncOut:
        """Store the tokens for the code the provider sent back, then run the first sync."""
        self._check_state(state, user_id, provider)
        now = self._now()
        tokens = await self._client(provider).exchange(code, now)
        for attempt in range(2):  # a second tab may insert the same connection at the same time
            connection = await self._repo.get(user_id, provider, lock=True)
            if connection is None:
                connection = Connection(user_id=user_id, provider=provider)
                self._repo.add(connection)
            connection.cursor = None  # possibly another account: start over
            connection.last_sync_at = None
            self._store(connection, tokens)
            try:
                await self._session.commit()
                break
            except IntegrityError:
                await self._session.rollback()
                if attempt:
                    raise
        try:
            return await self.sync(user_id, provider)
        except ProviderError:  # connected; the athlete can sync again at once
            return SyncOut(synced=False, last_sync_at=None, created=0, updated=0, skipped=0)

    async def sync(self, user_id: uuid.UUID, provider: Provider) -> SyncOut:
        """Bring in what changed since the last sync; at most one sync every 10 minutes."""
        client = self._client(provider)
        now = self._now()
        connection = await self._repo.get(user_id, provider, lock=True)
        if connection is None:
            raise NotFoundError("This account is not connected.")
        previous = connection.last_sync_at
        if previous is not None and now - previous < SYNC_INTERVAL:
            await self._session.rollback()
            return SyncOut(synced=False, last_sync_at=previous, created=0, updated=0, skipped=0)
        cursor = connection.cursor
        try:
            if connection.access_expires_at - now < REFRESH_MARGIN:
                refresh_token = self._decrypt(connection.refresh_token)
                self._store(connection, await client.refresh(refresh_token, now))
            access_token = self._decrypt(connection.access_token)
        except ReconnectRequiredError:
            await self._repo.remove(connection)
            await self._session.commit()
            raise
        connection.last_sync_at = now  # claims this sync; the lock ends with the commit
        await self._session.commit()
        try:
            result, new_cursor = await self._import(client, user_id, access_token, now, cursor)
        except ReconnectRequiredError:
            await self._drop(user_id, provider)
            raise
        except Exception:
            # Release the claim, so "Sync now" works again at once.
            await self._session.rollback()
            if connection := await self._repo.get(user_id, provider, lock=True):
                connection.last_sync_at = previous
            await self._session.commit()
            raise
        if connection := await self._repo.get(user_id, provider, lock=True):
            connection.cursor = new_cursor
        await self._session.commit()
        return SyncOut(synced=True, last_sync_at=now, **result.as_dict())

    async def disconnect(self, user_id: uuid.UUID, provider: Provider) -> None:
        """Forget the tokens. Data already brought in stays."""
        connection = await self._repo.get(user_id, provider, lock=True)
        if connection is None:
            raise NotFoundError("This account is not connected.")
        await self._repo.remove(connection)
        await self._session.commit()

    async def _import(
        self,
        client: ProviderClient,
        user_id: uuid.UUID,
        access_token: str,
        now: datetime,
        cursor: int | None,
    ) -> tuple[SyncCounts, int | None]:
        pulled = await client.pull(access_token, now, cursor)
        counts = SyncCounts(skipped=pulled.skipped)
        for start in range(0, len(pulled.weights), MAX_WEIGHTS):
            weights = pulled.weights[start : start + MAX_WEIGHTS]
            result = await self._weights.import_weights(user_id, weights)
            counts = counts.add(result.created, result.updated, result.skipped)
        for start in range(0, len(pulled.workouts), MAX_WORKOUTS):
            workouts = pulled.workouts[start : start + MAX_WORKOUTS]
            done = await self._workouts.import_workouts(user_id, workouts)
            counts = counts.add(done.created, done.updated, 0)
        return counts, pulled.cursor

    async def _drop(self, user_id: uuid.UUID, provider: Provider) -> None:
        await self._session.rollback()
        connection = await self._repo.get(user_id, provider, lock=True)
        if connection is not None:
            await self._repo.remove(connection)
        await self._session.commit()

    def _available(self, provider: Provider) -> ProviderClient | None:
        return self._clients.get(provider) if self._fernet else None

    def _client(self, provider: Provider) -> ProviderClient:
        client = self._available(provider)
        if client is None:
            raise ValidationFailedError("This connection is not set up on this server.")
        return client

    def _store(self, connection: Connection, tokens: Tokens) -> None:
        assert self._fernet is not None  # noqa: S101  # _client() checked it
        connection.access_token = self._fernet.encrypt(tokens.access_token.encode()).decode()
        connection.refresh_token = self._fernet.encrypt(tokens.refresh_token.encode()).decode()
        connection.access_expires_at = tokens.expires_at

    def _decrypt(self, value: str) -> str:
        assert self._fernet is not None  # noqa: S101  # _client() checked it
        try:
            return self._fernet.decrypt(value.encode()).decode()
        except InvalidToken as exc:  # the key was changed: the stored tokens are unusable
            raise ReconnectRequiredError("Connect the account again.") from exc

    def _state(self, user_id: uuid.UUID, provider: Provider) -> str:
        now = self._now()
        claims = {
            "sub": str(user_id),
            "provider": provider.value,
            "aud": STATE_AUDIENCE,
            "iat": int(now.timestamp()),
            "exp": int((now + STATE_TTL).timestamp()),
            "nonce": secrets.token_urlsafe(16),
        }
        secret = self._settings.jwt_secret.get_secret_value()
        return jwt.encode(claims, secret, algorithm=self._settings.jwt_algorithm)

    def _check_state(self, state: str, user_id: uuid.UUID, provider: Provider) -> None:
        try:
            claims = jwt.decode(
                state,
                self._settings.jwt_secret.get_secret_value(),
                algorithms=[self._settings.jwt_algorithm],
                audience=STATE_AUDIENCE,
                # Times are checked against the app's clock below, like every other time rule.
                options={
                    "require": ["sub", "provider", "aud", "exp"],
                    "verify_exp": False,
                    "verify_iat": False,
                },
            )
        except jwt.PyJWTError as exc:
            raise ValidationFailedError("The sign-in took too long or is invalid.") from exc
        if (
            claims["sub"] != str(user_id)
            or claims["provider"] != provider.value
            or int(claims["exp"]) < self._now().timestamp()
        ):
            raise ValidationFailedError("The sign-in took too long or is invalid.")
