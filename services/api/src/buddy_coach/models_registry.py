"""Imports every module's ORM models so ``Base.metadata`` is complete (used by Alembic)."""

from buddy_coach.core.db import Base
from buddy_coach.identity import models as identity_models
from buddy_coach.profile import models as profile_models

__all__ = ["Base", "identity_models", "profile_models"]
