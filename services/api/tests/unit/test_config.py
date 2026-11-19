from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
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


@pytest.mark.parametrize(
    "overrides",
    [
        {"llm_model": "qwen3:8b"},
        {"llm_base_url": "http://localhost:11434/v1"},
        {"llm_base_url": "http://localhost:11434/v1", "llm_model": " "},
    ],
)
def test_openai_compatible_needs_a_base_url_and_a_model(overrides: dict[str, str]) -> None:
    with pytest.raises(ValidationError, match="llm_base_url and llm_model are required"):
        make_settings(llm_provider=LLMProviderName.OPENAI_COMPATIBLE, **overrides)


def test_openai_compatible_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BUDDY_LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("BUDDY_LLM_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("BUDDY_LLM_MODEL", "qwen3:8b")
    settings = make_settings()
    assert (settings.llm_provider, settings.llm_model) == (
        LLMProviderName.OPENAI_COMPATIBLE,
        "qwen3:8b",
    )
    assert settings.llm_api_key is None


@pytest.mark.parametrize(
    "value",
    [
        "http://localhost:5173,https://app.example.ch",
        '["http://localhost:5173", "https://app.example.ch"]',
        "[http://localhost:5173,https://app.example.ch]",  # what `uv run --env-file` passes on
    ],
)
def test_cors_origins_accept_a_list_in_any_common_form(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("BUDDY_CORS_ORIGINS", value)
    assert make_settings().cors_origins == ["http://localhost:5173", "https://app.example.ch"]


def test_integrations_key_must_be_a_fernet_key() -> None:
    with pytest.raises(ValidationError, match="Fernet"):
        make_settings(integrations_key="not-a-key")
    assert make_settings(integrations_key=Fernet.generate_key().decode()).integrations_key


def test_production_needs_an_https_redirect_once_withings_is_set_up() -> None:
    with pytest.raises(ValidationError, match="https"):
        production_settings(withings_client_id="id")
    production_settings(
        withings_client_id="id", oauth_redirect_url="https://app.example/connections/callback"
    )
