"""Shared test helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from garmin_fit_sdk import Encoder, Profile

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
    # A developer's own .env must not leak into the tests.
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


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


FIT_START = datetime(2026, 11, 18, 7, 0, tzinfo=UTC)


def fit_file(*sessions: dict[str, Any]) -> bytes:
    """A FIT activity file, written with Garmin's SDK."""
    encoder = Encoder()
    encoder.on_mesg(
        Profile["mesg_num"]["FILE_ID"],
        {
            "type": "activity",
            "manufacturer": "garmin",
            "product": 1,
            "time_created": FIT_START,
            "serial_number": 1,
        },
    )
    for session in sessions:
        encoder.on_mesg(Profile["mesg_num"]["SESSION"], session)
    data: bytes = encoder.close()
    return data


FIT_RUN = {
    "start_time": FIT_START,
    "timestamp": FIT_START + timedelta(minutes=50),
    "sport": "running",
    "sub_sport": "trail",
    "total_elapsed_time": 3000.0,
    "total_timer_time": 2952.0,
    "total_distance": 10200.0,
    "total_ascent": 120,
    "avg_heart_rate": 152,
    "max_heart_rate": 175,
    "total_calories": 720,
}
