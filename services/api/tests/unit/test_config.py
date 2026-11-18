from __future__ import annotations

import pytest
from pydantic import ValidationError

from buddy_coach.core.config import Environment, LLMProviderName
from tests.support import make_settings, production_settings


def test_short_jwt_secret_is_rejected() -> None:
    with pytest.raises(ValidationError, match="at least 32"):
        make_settings(jwt_secret="short")


def test_production_flag() -> None:
    assert production_settings().is_production
    assert not make_settings().is_production


def test_dev_llm_is_refused_in_production() -> None:
    with pytest.raises(ValidationError, match="must not run in production"):
        make_settings(environment=Environment.PRODUCTION)


@pytest.mark.parametrize("key", [None, "", "   "])
def test_anthropic_requires_api_key(key: str | None) -> None:
    with pytest.raises(ValidationError, match="anthropic_api_key is required"):
        make_settings(llm_provider=LLMProviderName.ANTHROPIC, anthropic_api_key=key)
