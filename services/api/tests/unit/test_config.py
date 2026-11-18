from __future__ import annotations

import pytest
from pydantic import ValidationError

from buddy_coach.core.config import Environment
from tests.support import make_settings


def test_short_jwt_secret_is_rejected() -> None:
    with pytest.raises(ValidationError, match="at least 32"):
        make_settings(jwt_secret="short")


def test_production_flag() -> None:
    assert make_settings(environment=Environment.PRODUCTION).is_production
    assert not make_settings().is_production
