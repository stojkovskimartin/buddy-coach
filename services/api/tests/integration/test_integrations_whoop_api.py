"""Direct WHOOP connection against a fake WHOOP, with a clock that can move."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI

from buddy_coach.core.deps import get_clock
from buddy_coach.integrations.deps import get_provider_clients
from buddy_coach.integrations.domain import Provider
from buddy_coach.integrations.whoop import TOKEN_URL, WORKOUTS_URL, WhoopClient
from tests.support import VALID_PROFILE, make_settings, register_and_login

pytestmark = pytest.mark.integration

URL = "/api/v1/integrations"
REDIRECT = "http://localhost:5173/connections/callback"
START = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)


def _workout(n: int, at: datetime, minutes: int = 45) -> dict[str, Any]:
    return {
        "id": f"00000000-0000-0000-0000-{n:012d}",
        "start": at.isoformat(),
        "end": (at + timedelta(minutes=minutes)).isoformat(),
        "sport_name": "cycling",
        "score_state": "SCORED",
        "score": {"average_heart_rate": 140, "max_heart_rate": 170, "kilojoule": 2000},
    }


@dataclass
class FakeWhoop:
    """Answers like WHOOP (newest first, pages of 2) and records what it was asked."""

    workouts: list[dict[str, Any]] = field(default_factory=list)
    token_status: int = 200
    workout_status: int = 200
    issued: int = 0
    calls: list[dict[str, str]] = field(default_factory=list)

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url.copy_with(query=None))
        if url == TOKEN_URL:
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            self.calls.append({"url": url, **form})
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"error": "invalid_grant"})
            if (
                form["grant_type"] == "refresh_token"
                and form["refresh_token"] != f"r-{self.issued}"
            ):
                return httpx.Response(400, json={"error": "invalid_grant"})
            self.issued += 1
            body = {
                "access_token": f"a-{self.issued}",
                "refresh_token": f"r-{self.issued}",
                "expires_in": 3600,
                "scope": "offline read:workout",
                "token_type": "bearer",
            }
            return httpx.Response(200, json=body)
        assert url == WORKOUTS_URL
        query = dict(request.url.params)
        self.calls.append({"url": url, **query})
        assert request.headers["Authorization"] == f"Bearer a-{self.issued}"
        if self.workout_status != 200:
            return httpx.Response(self.workout_status, json={})
        offset = int(query.get("nextToken", "0"))
        page = self.workouts[offset : offset + 2]
        next_token = str(offset + 2) if offset + 2 < len(self.workouts) else None
        return httpx.Response(200, json={"records": page, "next_token": next_token})


@dataclass
class Clock:
    now: datetime = START

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def fake() -> FakeWhoop:
    return FakeWhoop()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture(autouse=True)
async def whoop_app(app: FastAPI, fake: FakeWhoop, clock: Clock) -> AsyncIterator[None]:
    app.state.settings = make_settings(
        database_url=app.state.settings.database_url,
        integrations_key=Fernet.generate_key().decode(),
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as http:
        whoop = WhoopClient(http, "whoop-id", "whoop-secret", REDIRECT)
        app.dependency_overrides[get_provider_clients] = lambda: {Provider.WHOOP: whoop}
        app.dependency_overrides[get_clock] = lambda: clock
        yield
    app.dependency_overrides.clear()


async def _connect(client: httpx.AsyncClient) -> dict[str, str]:
    headers = await register_and_login(client)
    assert (
        await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    ).status_code == 200
    authorize = (await client.post(f"{URL}/whoop/connect", headers=headers)).json()
    url = urlsplit(authorize["authorize_url"])
    query = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert (
        f"{url.scheme}://{url.netloc}{url.path}" == "https://api.prod.whoop.com/oauth/oauth2/auth"
    )
    assert (query["scope"], query["redirect_uri"], query["response_type"]) == (
        "offline read:workout",
        REDIRECT,
        "code",
    )
    response = await client.post(
        f"{URL}/whoop/callback", json={"code": "code", "state": query["state"]}, headers=headers
    )
    assert response.status_code == 200, response.text
    return headers


async def test_connecting_brings_in_every_page_of_the_last_year(
    client: httpx.AsyncClient, fake: FakeWhoop
) -> None:
    fake.workouts = [_workout(n, START - timedelta(days=n)) for n in range(1, 6)]
    fake.workouts.append(_workout(9, START - timedelta(days=9), minutes=2000))  # unusable

    headers = await _connect(client)

    exchange = fake.calls[0]
    assert (exchange["grant_type"], exchange["client_secret"], exchange["redirect_uri"]) == (
        "authorization_code",
        "whoop-secret",
        REDIRECT,
    )
    pages = [c for c in fake.calls if c["url"] == WORKOUTS_URL]
    assert [p.get("nextToken") for p in pages] == [None, "2", "4"]
    assert pages[0]["start"] == "2025-11-18T23:30:00Z"
    assert pages[0]["end"] == "2026-11-18T23:30:00Z"
    sources = (await client.get("/api/v1/workouts/sources", headers=headers)).json()
    assert [(s["source"], s["workouts"]) for s in sources] == [("whoop", 5)]
    workouts = (await client.get("/api/v1/workouts", headers=headers)).json()
    assert workouts[0]["activity"] == "cycling"
    assert workouts[0]["kcal"] == 478


async def test_later_syncs_read_from_a_week_before_the_last_one_with_a_fresh_token(
    client: httpx.AsyncClient, fake: FakeWhoop, clock: Clock
) -> None:
    headers = await _connect(client)
    clock.now += timedelta(hours=2)  # the access token (1 hour) has expired
    fake.workouts = [_workout(1, clock.now - timedelta(hours=1))]

    response = await client.post(f"{URL}/whoop/sync", headers=headers)

    assert response.json()["created"] == 1
    refresh = next(c for c in fake.calls if c.get("grant_type") == "refresh_token")
    assert (refresh["refresh_token"], refresh["scope"]) == ("r-1", "offline")
    assert fake.calls[-1]["start"] == "2026-11-11T23:30:00Z"
    again = await client.post(f"{URL}/whoop/sync", headers=headers)
    assert again.json()["synced"] is False  # within 10 minutes


async def test_a_refused_token_disconnects_and_a_rate_limit_does_not(
    client: httpx.AsyncClient, fake: FakeWhoop, clock: Clock
) -> None:
    headers = await _connect(client)
    clock.now += timedelta(minutes=20)
    fake.workout_status = 429

    limited = await client.post(f"{URL}/whoop/sync", headers=headers)
    fake.workout_status = 401
    refused = await client.post(f"{URL}/whoop/sync", headers=headers)

    assert (limited.status_code, limited.json()["code"]) == (502, "provider_error")
    assert (refused.status_code, refused.json()["code"]) == (409, "reconnect_required")
    providers = (await client.get(URL, headers=headers)).json()
    assert [p["connected"] for p in providers if p["provider"] == "whoop"] == [False]


async def test_a_server_error_while_refreshing_keeps_the_account(
    client: httpx.AsyncClient, fake: FakeWhoop, clock: Clock
) -> None:
    headers = await _connect(client)
    clock.now += timedelta(hours=2)
    fake.token_status = 503

    response = await client.post(f"{URL}/whoop/sync", headers=headers)

    assert response.status_code == 502
    providers = (await client.get(URL, headers=headers)).json()
    assert [p["connected"] for p in providers if p["provider"] == "whoop"] == [True]
