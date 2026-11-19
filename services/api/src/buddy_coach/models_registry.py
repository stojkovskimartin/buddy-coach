"""Imports every module's ORM models so ``Base.metadata`` is complete (used by Alembic)."""

from buddy_coach.checkin import models as checkin_models
from buddy_coach.core.db import Base
from buddy_coach.identity import models as identity_models
from buddy_coach.profile import models as profile_models
from buddy_coach.workouts import models as workouts_models

__all__ = ["Base", "checkin_models", "identity_models", "profile_models", "workouts_models"]
