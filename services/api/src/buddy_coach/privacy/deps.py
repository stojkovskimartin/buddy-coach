"""Dependencies for the privacy module. Every service shares the request's session."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from buddy_coach.body.deps import get_body_service
from buddy_coach.body.service import BodyService
from buddy_coach.checkin.deps import get_checkin_service
from buddy_coach.checkin.service import CheckinService
from buddy_coach.core.db import get_session
from buddy_coach.identity.deps import get_identity_service
from buddy_coach.identity.service import IdentityService
from buddy_coach.integrations.deps import get_integrations_service
from buddy_coach.integrations.service import IntegrationsService
from buddy_coach.meals.deps import get_meal_service
from buddy_coach.meals.service import MealService
from buddy_coach.media.deps import get_photo_service
from buddy_coach.media.service import PhotoService
from buddy_coach.privacy.service import PrivacyService
from buddy_coach.profile.deps import get_profile_service
from buddy_coach.profile.service import ProfileService
from buddy_coach.workouts.deps import get_workout_service
from buddy_coach.workouts.service import WorkoutService


def get_privacy_service(  # one argument per module with user data
    session: Annotated[AsyncSession, Depends(get_session)],
    accounts: Annotated[IdentityService, Depends(get_identity_service)],
    profiles: Annotated[ProfileService, Depends(get_profile_service)],
    checkins: Annotated[CheckinService, Depends(get_checkin_service)],
    workouts: Annotated[WorkoutService, Depends(get_workout_service)],
    weights: Annotated[BodyService, Depends(get_body_service)],
    meals: Annotated[MealService, Depends(get_meal_service)],
    photos: Annotated[PhotoService, Depends(get_photo_service)],
    connections: Annotated[IntegrationsService, Depends(get_integrations_service)],
) -> PrivacyService:
    """Build the privacy service for one request."""
    return PrivacyService(
        session,
        accounts=accounts,
        profiles=profiles,
        checkins=checkins,
        workouts=workouts,
        weights=weights,
        meals=meals,
        photos=photos,
        connections=connections,
    )


PrivacyServiceDep = Annotated[PrivacyService, Depends(get_privacy_service)]
