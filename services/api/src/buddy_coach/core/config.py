"""Application settings loaded from environment variables (prefix ``BUDDY_``)."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from typing import Annotated

from cryptography.fernet import Fernet
from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

MIN_SECRET_LENGTH = 32


class Environment(StrEnum):
    """Deployment environment."""

    DEVELOPMENT = "development"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class LLMProviderName(StrEnum):
    """Which LLM backs the coach agents."""

    DEV = "dev"  # deterministic stand-in, no API key, never in production
    ANTHROPIC = "anthropic"
    OPENAI_COMPATIBLE = "openai_compatible"  # Ollama, LM Studio, Groq, Gemini, OpenRouter


class Settings(BaseSettings):
    """All runtime configuration. Values come from the environment or a ``.env`` file."""

    model_config = SettingsConfigDict(env_prefix="BUDDY_", env_file=".env", extra="ignore")

    environment: Environment = Environment.DEVELOPMENT
    database_url: str = "postgresql+asyncpg://buddy:buddy@localhost:5432/buddy"
    database_pool_size: int = Field(default=10, ge=1, le=100)
    jwt_secret: SecretStr
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "buddy-coach"
    jwt_audience: str = "buddy-coach-api"
    access_token_ttl_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_ttl_days: int = Field(default=30, ge=1, le=90)
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"],
        description='A JSON list or comma-separated: ["https://a.ch","https://b.ch"] or a,b',
    )
    log_level: str = "INFO"
    llm_provider: LLMProviderName = LLMProviderName.DEV
    llm_model: str = "claude-sonnet-5-5"
    anthropic_api_key: SecretStr | None = None
    llm_base_url: str | None = None  # openai_compatible, e.g. http://localhost:11434/v1
    llm_api_key: SecretStr | None = None  # openai_compatible; local servers need none
    media_dir: str = "./media"  # photos on local disk; an S3-compatible store later
    meal_photo_retention_days: int = Field(default=90, ge=1, le=3650)
    # Direct account connections: tokens are encrypted with this Fernet key; a provider is
    # offered only when its client id and secret are set too.
    integrations_key: SecretStr | None = None
    oauth_redirect_url: str = "http://localhost:5173/connections/callback"
    withings_client_id: str | None = None
    withings_client_secret: SecretStr | None = None
    whoop_client_id: str | None = None
    whoop_client_secret: SecretStr | None = None
    fake_providers: bool = False
    """Stand-ins for Withings and WHOOP without keys or internet; development and tests only."""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _origins(cls, value: object) -> object:
        # Some .env loaders (e.g. `uv run --env-file`) drop the inner quotes of a JSON list, so
        # both forms are accepted: brackets and quotes around the items are optional.
        if isinstance(value, str):
            items = value.strip().removeprefix("[").removesuffix("]").split(",")
            return [i.strip().strip("\"'") for i in items if i.strip().strip("\"'")]
        return value

    @field_validator("jwt_secret")
    @classmethod
    def _secret_is_long_enough(cls, value: SecretStr) -> SecretStr:
        # Short HMAC secrets can be brute-forced; refuse to start with one.
        if len(value.get_secret_value()) < MIN_SECRET_LENGTH:
            msg = f"jwt_secret must be at least {MIN_SECRET_LENGTH} characters"
            raise ValueError(msg)
        return value

    @field_validator("integrations_key")
    @classmethod
    def _key_is_fernet(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None:
            try:
                Fernet(value.get_secret_value())
            except ValueError as exc:
                msg = "integrations_key must be a Fernet key (Fernet.generate_key())"
                raise ValueError(msg) from exc
        return value

    @model_validator(mode="after")
    def _redirect_is_safe_in_production(self) -> Settings:
        if (
            self.is_production
            and (self.withings_client_id or self.whoop_client_id)
            and not self.oauth_redirect_url.startswith("https://")
        ):
            msg = "oauth_redirect_url must be https in production"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _fake_providers_only_locally(self) -> Settings:
        if self.fake_providers and self.environment not in {
            Environment.DEVELOPMENT,
            Environment.TEST,
        }:
            msg = "fake_providers is for development and tests only"
            raise ValueError(msg)
        if self.fake_providers and self.integrations_key is None:
            msg = "fake_providers needs integrations_key (tokens are stored encrypted)"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _llm_is_configured(self) -> Settings:
        key = self.anthropic_api_key.get_secret_value().strip() if self.anthropic_api_key else ""
        if self.llm_provider is LLMProviderName.ANTHROPIC and not key:
            msg = "anthropic_api_key is required when llm_provider is 'anthropic'"
            raise ValueError(msg)
        if self.llm_provider is LLMProviderName.OPENAI_COMPATIBLE and (
            not self.llm_base_url
            or "llm_model" not in self.model_fields_set
            or not self.llm_model.strip()
        ):
            msg = "llm_base_url and llm_model are required when llm_provider is 'openai_compatible'"
            raise ValueError(msg)
        if self.is_production and self.llm_provider is LLMProviderName.DEV:
            msg = "the dev LLM provider must not run in production"
            raise ValueError(msg)
        return self

    @property
    def is_production(self) -> bool:
        """True when running in production."""
        return self.environment is Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()  # values come from the environment
