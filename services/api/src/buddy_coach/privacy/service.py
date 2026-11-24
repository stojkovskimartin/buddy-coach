"""Data export and account deletion.

Each module exports and erases its own rows through its service, in the request's session and
without committing; this service owns the transactions. Deletion has two commits: first the
account is blocked and its refresh tokens revoked (so no new request gets in), then every
module's rows are deleted in one transaction, the account last. Photo files go after that commit.
If the second transaction fails, the account is unblocked again so the user can retry.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Protocol, TypeVar

from anyio import CancelScope
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.body.schemas import WeightOut
from buddy_coach.checkin.schemas import CheckinRecord
from buddy_coach.identity.schemas import AccountRecord
from buddy_coach.integrations.schemas import ConnectionRecord
from buddy_coach.meals.schemas import MealEntryOut
from buddy_coach.media.schemas import PhotoRecord
from buddy_coach.privacy.schemas import DataExport
from buddy_coach.profile.schemas import ProfileExport
from buddy_coach.workouts.schemas import WorkoutOut

logger = logging.getLogger(__name__)

RecordT = TypeVar("RecordT")


class Erasable(Protocol):
    """A module that can delete all of a user's rows (joining the caller's transaction)."""

    async def erase_user(self, user_id: uuid.UUID) -> None: ...


class Records(Erasable, Protocol[RecordT]):
    """A module whose export is a list of records."""

    async def export_user(self, user_id: uuid.UUID) -> list[RecordT]: ...


class Accounts(Erasable, Protocol):
    """What the privacy module needs from the identity module."""

    async def export_user(self, user_id: uuid.UUID) -> AccountRecord: ...

    async def deactivate(self, user_id: uuid.UUID, password: str) -> None: ...

    async def reactivate(self, user_id: uuid.UUID) -> None: ...


class Profiles(Erasable, Protocol):
    """What the privacy module needs from the profile module."""

    async def export_user(self, user_id: uuid.UUID) -> ProfileExport: ...


class Photos(Records[PhotoRecord], Protocol):
    """What the privacy module needs from the media module."""

    async def delete_user_files(self, user_id: uuid.UUID) -> None: ...


class PrivacyService:
    """Commits its own transactions."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        accounts: Accounts,
        profiles: Profiles,
        checkins: Records[CheckinRecord],
        workouts: Records[WorkoutOut],
        weights: Records[WeightOut],
        meals: Records[MealEntryOut],
        photos: Photos,
        connections: Records[ConnectionRecord],
    ) -> None:
        self._session = session
        self._accounts = accounts
        self._profiles = profiles
        self._checkins = checkins
        self._workouts = workouts
        self._weights = weights
        self._meals = meals
        self._photos = photos
        self._connections = connections

    async def export(self, user_id: uuid.UUID, now: datetime) -> DataExport:
        """Everything stored about the user."""
        profile = await self._profiles.export_user(user_id)
        return DataExport(
            exported_at=now,
            account=await self._accounts.export_user(user_id),
            profile=profile.profile,
            goals=profile.goals,
            checkins=await self._checkins.export_user(user_id),
            workouts=await self._workouts.export_user(user_id),
            weights=await self._weights.export_user(user_id),
            meals=await self._meals.export_user(user_id),
            photos=await self._photos.export_user(user_id),
            connections=await self._connections.export_user(user_id),
        )

    async def delete_account(self, user_id: uuid.UUID, password: str) -> None:
        """Delete the account and all its data. A wrong password changes nothing."""
        await self._accounts.deactivate(user_id, password)
        await self._session.commit()

        modules: list[Erasable] = [
            self._profiles,
            self._checkins,
            self._workouts,
            self._weights,
            self._meals,
            self._photos,
            self._connections,
            self._accounts,  # last: the account goes only with everything else
        ]
        try:
            for module in modules:
                await module.erase_user(user_id)
            await self._session.commit()
        except BaseException:
            # Never leave a blocked account with its data: unblock it so the user can log in again
            # and retry. Refresh tokens stay revoked.
            with CancelScope(shield=True):
                await self._session.rollback()
                await self._accounts.reactivate(user_id)
                await self._session.commit()
            logger.warning("account_deletion_failed", extra={"user_id": str(user_id)})
            raise

        await self._photos.delete_user_files(user_id)
        logger.info("account_deleted", extra={"user_id": str(user_id)})
