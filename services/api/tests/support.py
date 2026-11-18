"""Shared test helpers."""

from __future__ import annotations

from typing import Any

import httpx

from buddy_coach.core.config import Environment, Settings
from buddy_coach.core.events import DomainEvent, Handler, InProcessEventBus

TEST_JWT_SECRET = "test-secret-" + "x" * 40
UNREACHABLE_DB_URL = "postgresql+asyncpg://nobody@127.0.0.1:1/none"
DEFAULT_PASSWORD = "correct-horse-battery"


def make_settings(**overrides: Any) -> Settings:
    """Settings for tests; no environment variables needed."""
    values: dict[str, Any] = {
        "environment": Environment.TEST,
        "database_url": UNREACHABLE_DB_URL,
        "jwt_secret": TEST_JWT_SECRET,
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(**values)


def production_settings(**overrides: Any) -> Settings:
    """Valid production settings (real LLM provider configured)."""
    return make_settings(
        environment=Environment.PRODUCTION,
        llm_provider="anthropic",
        anthropic_api_key="test-key",
        **overrides,
    )


class RecordingEventBus(InProcessEventBus):
    """In-process bus that also remembers every published event."""

    def __init__(self) -> None:
        super().__init__()
        self.published: list[DomainEvent] = []

    def subscribe(self, event_type: type[DomainEvent], handler: Handler) -> None:
        """Register a handler."""
        super().subscribe(event_type, handler)

    async def publish(self, event: DomainEvent) -> None:
        """Record, then deliver."""
        self.published.append(event)
        await super().publish(event)


async def register_and_login(
    client: httpx.AsyncClient, email: str = "athlete@example.com", password: str = DEFAULT_PASSWORD
) -> dict[str, str]:
    """Create an account and return auth headers for it."""
    response = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    tokens = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert tokens.status_code == 200, tokens.text
    return {"Authorization": f"Bearer {tokens.json()['access_token']}"}


VALID_PROFILE: dict[str, Any] = {
    "birth_year": 1998,
    "sex": "male",
    "height_cm": 182,
    "weight_kg": 79,
    "experience": "intermediate",
    "coach_style": "data_driven",
    "available_days_per_week": 5,
    "minutes_per_session": 60,
    "timezone": "Europe/Zurich",
    "locale": "en",
}
