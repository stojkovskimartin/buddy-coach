"""Connect and sync with the fake providers: no keys, no internet."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI

from buddy_coach.core.deps import get_clock
from tests.support import VALID_PROFILE, make_settings, register_and_login

pytestmark = pytest.mark.integration

URL = "/api/v1/integrations"
REDIRECT = "http://localhost:5173/connections/callback"
NOW = datetime(2030, 6, 1, 18, 0, tzinfo=UTC)
"""Years after the wall clock: every time rule follows the app's clock, the sign-in too."""


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clock(app: FastAPI) -> Iterator[Clock]:
    clock = Clock()
    app.state.settings = make_settings(
        database_url=app.state.settings.database_url,
        integrations_key=Fernet.generate_key().decode(),
        fake_providers=True,
    )
    app.dependency_overrides[get_clock] = lambda: clock
    yield clock
    app.dependency_overrides.clear()


async def _connect(client: httpx.AsyncClient, headers: dict[str, str], provider: str) -> dict:
    started = await client.post(f"{URL}/{provider}/connect", headers=headers)
    url = urlsplit(started.json()["authorize_url"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == REDIRECT  # straight back, no internet
    query = {k: v[0] for k, v in parse_qs(url.query).items()}
    response = await client.post(f"{URL}/{provider}/callback", json=query, headers=headers)
    assert response.status_code == 200, response.text
    return dict(response.json())


async def test_both_accounts_connect_and_sync_without_keys(
    client: httpx.AsyncClient, clock: Clock
) -> None:
    headers = await register_and_login(client, "athlete@example.com")
    assert (
        await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    ).status_code == 200
    providers = (await client.get(URL, headers=headers)).json()
    assert {p["provider"]: p["available"] for p in providers} == {"withings": True, "whoop": True}

    withings = await _connect(client, headers, "withings")
    whoop = await _connect(client, headers, "whoop")

    assert (withings["synced"], withings["created"]) == (True, 31)
    assert (whoop["synced"], whoop["created"]) == (True, 15)
    weights = (await client.get("/api/v1/body/weights", headers=headers)).json()["weights"]
    assert {w["source"] for w in weights} == {"withings"}

    clock.now = NOW + timedelta(minutes=11)  # past the 10-minute limit, still the same day
    again = (await client.post(f"{URL}/withings/sync", headers=headers)).json()
    assert (again["synced"], again["created"], again["updated"]) == (True, 0, 1)


async def test_a_forged_state_is_still_refused(client: httpx.AsyncClient, clock: Clock) -> None:
    headers = await register_and_login(client, "athlete@example.com")
    response = await client.post(
        f"{URL}/withings/callback", json={"code": "fake", "state": "forged"}, headers=headers
    )
    assert response.status_code == 422


async def test_without_fake_providers_nothing_is_offered(
    client: httpx.AsyncClient, clock: Clock, app: FastAPI
) -> None:
    app.state.settings = make_settings(
        database_url=app.state.settings.database_url,
        integrations_key=Fernet.generate_key().decode(),
    )
    headers = await register_and_login(client, "athlete@example.com")
    providers = (await client.get(URL, headers=headers)).json()
    assert {p["provider"]: p["available"] for p in providers} == {
        "withings": False,
        "whoop": False,
    }
