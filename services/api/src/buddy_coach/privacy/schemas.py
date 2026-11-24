"""Public response models of the privacy module."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from buddy_coach.body.schemas import WeightOut
from buddy_coach.checkin.schemas import CheckinRecord
from buddy_coach.identity.schemas import AccountRecord
from buddy_coach.integrations.schemas import ConnectionRecord
from buddy_coach.meals.schemas import MealEntryOut
from buddy_coach.media.schemas import PhotoRecord
from buddy_coach.profile.schemas import GoalOut, ProfileOut
from buddy_coach.workouts.schemas import WorkoutOut


class DataExport(BaseModel):
    """Everything stored about the user, as one JSON document. Photos are metadata only;
    no password hash, tokens or sync cursors."""

    exported_at: datetime
    account: AccountRecord
    profile: ProfileOut | None
    goals: list[GoalOut]
    checkins: list[CheckinRecord]
    workouts: list[WorkoutOut]
    weights: list[WeightOut]
    meals: list[MealEntryOut]
    photos: list[PhotoRecord]
    connections: list[ConnectionRecord]
